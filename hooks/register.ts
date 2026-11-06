import type { Engine, Register } from 'claude-code'

// Claude Code puts the signed-in account's address in the model's context
// (the `userEmail` block), and the model has written it into User-Agent
// headers on its own: https://github.com/anthropics/claude-code/issues/107757
//
// This module drops that block and refuses tool calls that would send one of
// the protected addresses off the machine:
// - Bash, PowerShell: the command holds the address, or reads it from git or
//   the Claude login, and reaches the network.
// - Write, Edit, NotebookEdit: the file puts the address in a User-Agent, a
//   mailto: link or an email= parameter (a script that would send it later).
// - WebFetch, WebSearch, browser tools: the address appears anywhere.
// - Other MCP tools: the address appears beside a URL.
// Local uses (a file path, a document, a database query) pass.

const NET = /curl|wget|invoke-webrequest|invoke-restmethod|\biwr\b|\birm\b|https?:|requests\.|urllib|httpx|aiohttp|webclient|httpclient|fetch\(|user-?agent/i
const HEADER = /user-?agent|user_agent|mailto:|[?&]email=/i
const READS_OWN = /git\s+(?:-C\s+\S+\s+)?config\b[^\n|;&]*\buser\.email\b|oauthAccount/i
const URL = /https?:/i
const BROWSER = /^mcp__(claude-in-chrome|Claude_Browser|remote-devices)__/
const SHELL = new Set(['Bash', 'PowerShell'])
const FILES = new Set(['Write', 'Edit', 'NotebookEdit'])
const WEB = new Set(['WebFetch', 'WebSearch'])
const ADDRESS = /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/gi

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// One pattern for every protected address, plain or URL-encoded (%40).
const patternOf = (addresses: ReadonlySet<string>) => {
  const parts = [...addresses].map(a => escapeRe(a).replace('@', '(?:@|%40)'))

  return parts.length > 0 ? new RegExp(parts.join('|'), 'i') : undefined
}

const isGuarded = (tool: string) =>
  SHELL.has(tool) || FILES.has(tool) || WEB.has(tool) || tool.startsWith('mcp__')

const reasonFor = (tool: string, text: string, own: RegExp | undefined) => {
  const isNamed = own?.test(text) ?? false

  if (SHELL.has(tool)) {
    if (isNamed && NET.test(text)) return 'the command holds the address and reaches the network'
    if (READS_OWN.test(text) && NET.test(text)) return 'the command reads the address from git or the Claude login and reaches the network'

    return undefined
  }
  if (!isNamed) return undefined
  if (FILES.has(tool)) {
    return HEADER.test(text) ? 'the file puts the address in a User-Agent, a mailto: link or an email= parameter' : undefined
  }
  if (WEB.has(tool) || BROWSER.test(tool)) return 'the request holds the address'
  if (tool.startsWith('mcp__') && URL.test(text)) return 'the request holds the address beside a URL'

  return undefined
}

// The Claude login (~/.claude.json) and git's global config, read once per load.
async function addressesOnMachine($: Engine) {
  const found: string[] = []
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
  const configDir = await $.env.get('CLAUDE_CONFIG_DIR')
  const logins = [configDir && `${configDir}/.claude.json`, home && `${home}/.claude.json`]
  const gitFiles = [home && `${home}/.gitconfig`, home && `${home}/.config/git/config`]

  for (const path of logins) {
    if (!path) continue
    const text = await $.fs.read(path).then(String, () => '')
    try {
      found.push(String(JSON.parse(text)?.oauthAccount?.emailAddress ?? ''))
    } catch {
      // Not there, or not JSON: nothing to learn from it.
    }
  }
  for (const path of gitFiles) {
    if (!path) continue
    const text = await $.fs.read(path).then(String, () => '')
    for (const line of text.split(/\r?\n/)) {
      if (/^\s*email\s*=/i.test(line)) found.push(line)
    }
  }

  return found
}

const denial = (why: string) =>
  `email-guard blocked this call: ${why}, which would send the user's own email address off this machine. ` +
  'Redo it without the address: a generic User-Agent such as "research-script/1.0" and no contact field. ' +
  'Do not encode, split or rebuild the address. If the user asked for it to be sent, tell them to send it themselves.'

export const register: Register = (on, options) => {
  const known = new Set<string>()
  const learn = (text: unknown) => {
    for (const found of String(text ?? '').match(ADDRESS) ?? []) known.add(found.toLowerCase())
  }
  let loading: Promise<void> | undefined

  learn(options.extraEmails)

  on('prompt.context', async ($, e, next) => {
    for (const block of e.blocks) {
      if (block.name === 'userEmail') learn(block.text)
    }
    if (options.keepInContext === true) return next(e)

    const result = await next({ ...e, blocks: e.blocks.filter(b => b.name !== 'userEmail') })

    return { ...result, blocks: result.blocks.filter(b => b.name !== 'userEmail') }
  })

  on('tool.call', async ($, e, next) => {
    const tool = String(e.tool)

    if (!isGuarded(tool)) return next(e)
    loading ??= addressesOnMachine($).then(list => list.forEach(learn), () => undefined)
    await loading

    const { tool: _tool, tool_use_id: _id, agentId: _agent, requestMeta: _meta, ...args } =
      e as unknown as Record<string, unknown>
    const why = reasonFor(tool, JSON.stringify(args), patternOf(known))

    return why ? { deny: denial(why) } : next(e)
  }).catch(($, e, next) => {
    if (next.called) return next(e)

    return isGuarded(String(e.tool)) ? { deny: 'email-guard: its check failed, so the call was held back.' } : next(e)
  })
}
