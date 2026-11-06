import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

const ALICE = { options: { extraEmails: 'alice@example.com' } }

// Stands for the engine: no environment, no files, every tool answers.
const plainMachine = (on: On) => {
  on('env.get', () => ({ value: undefined }))
  on('fs.read', () => ({ value: '' }))
  on('tool.call', () => ({ result: {} }))
}

const denyOf = (r: unknown) => String((r as { deny?: string }).deny ?? '')

test('a User-Agent with the address is blocked', ALICE, async ($, on) => {
  plainMachine(on)
  const r = await $.tool.call({
    tool: 'PowerShell',
    command: '$ua="ResearchBot/1.0 (contact: alice@example.com)"; Invoke-WebRequest https://nominatim.openstreetmap.org/search?q=x -UserAgent $ua',
  })
  expect(denyOf(r)).toMatch(/email-guard/)
})

test('the address in capitals or URL-encoded is blocked', ALICE, async ($, on) => {
  plainMachine(on)
  const shell = await $.tool.call({ tool: 'Bash', command: 'curl -A "bot ALICE@EXAMPLE.COM" https://example.org' })
  const fetch = await $.tool.call({ tool: 'WebFetch', url: 'https://api.example.org/v1?email=alice%40example.com', prompt: 'x' })
  expect(denyOf(shell)).toMatch(/email-guard/)
  expect(denyOf(fetch)).toMatch(/email-guard/)
})

test('an address read from git at run time is blocked', async ($, on) => {
  plainMachine(on)
  const r = await $.tool.call({ tool: 'Bash', command: 'curl -A "bot ($(git config user.email))" https://api.example.org' })
  expect(denyOf(r)).toMatch(/email-guard/)
})

test('local uses of the address pass', ALICE, async ($, on) => {
  plainMachine(on)
  const path = await $.tool.call({ tool: 'PowerShell', command: "Test-Path 'C:\\Users\\a\\Outlook\\alice@example.com.ost'" })
  const doc = await $.tool.call({ tool: 'Write', file_path: 'C:/tmp/b.md', content: '**From:** alice@example.com, see https://example.org' })
  const sql = await $.tool.call({ tool: 'mcp__sql-server__run-sql', sql: "SELECT 1 FROM MAIL WHERE TO_ADDR = 'alice@example.com'" })
  const git = await $.tool.call({ tool: 'Bash', command: 'git config --global user.email' })
  for (const r of [path, doc, sql, git]) expect(denyOf(r)).toBe('')
})

test('a script that would send the address later is blocked', ALICE, async ($, on) => {
  plainMachine(on)
  const r = await $.tool.call({ tool: 'Write', file_path: 'C:/tmp/a.py', content: "headers = {'User-Agent': 'x (alice@example.com)'}" })
  expect(denyOf(r)).toMatch(/email-guard/)
})

test('a browser form with the address is blocked', ALICE, async ($, on) => {
  plainMachine(on)
  const r = await $.tool.call({ tool: 'mcp__claude-in-chrome__form_input', ref: 'e1', value: 'alice@example.com' })
  expect(denyOf(r)).toMatch(/email-guard/)
})

test('the login and git config addresses are found on their own', async ($, on) => {
  on('env.get', (_, e) => ({ value: e.name === 'USERPROFILE' ? 'C:/Users/x' : undefined }))
  on('fs.read', (_, e) => {
    // The engine hands the path on in the platform's own spelling.
    const path = e.path.replace(/\\/g, '/')
    if (path === 'C:/Users/x/.claude.json') return { value: JSON.stringify({ oauthAccount: { emailAddress: 'carol@example.com' } }) }
    if (path === 'C:/Users/x/.gitconfig') return { value: '[user]\n\temail = dave@example.com\n[core]\n' }
    return { value: '' }
  })
  on('tool.call', () => ({ result: {} }))
  const login = await $.tool.call({ tool: 'Bash', command: 'curl -A "x carol@example.com" https://example.org' })
  const git = await $.tool.call({ tool: 'Bash', command: 'curl -A "x dave@example.com" https://example.org' })
  expect(denyOf(login)).toMatch(/email-guard/)
  expect(denyOf(git)).toMatch(/email-guard/)
})

test('the userEmail block is dropped, and its address guarded', async ($, on) => {
  plainMachine(on)
  on('prompt.context', (_, e) => ({ blocks: e.blocks }))
  const context = await $.prompt.context({
    blocks: [
      { name: 'userEmail', text: "The user's email address is erin@example.com." },
      { name: 'currentDate', text: 'Today is 2026-11-06.' },
    ],
  })
  expect(context.blocks.map(b => b.name)).toEqual(['currentDate'])
  const r = await $.tool.call({ tool: 'Bash', command: 'curl -A "x erin@example.com" https://example.org' })
  expect(denyOf(r)).toMatch(/email-guard/)
})

test('keepInContext leaves the block in place', { options: { keepInContext: true } }, async ($, on) => {
  plainMachine(on)
  on('prompt.context', (_, e) => ({ blocks: e.blocks }))
  const context = await $.prompt.context({ blocks: [{ name: 'userEmail', text: "The user's email address is erin@example.com." }] })
  expect(context.blocks.map(b => b.name)).toEqual(['userEmail'])
})
