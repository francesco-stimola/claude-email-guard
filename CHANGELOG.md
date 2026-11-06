# Changelog

## 1.0.0 - 2026-11-06

First release.

- **The address leaves the context.** Claude Code tells the model the
  signed-in account's address in a context block named `userEmail`; the mod
  drops it from the first message, and again whenever the context is read
  anew (compaction, `/clear`). The `keepInContext` option keeps it.
- **Calls that would send it are refused, with no prompt.** Bash and
  PowerShell commands that hold the address, or read it from `git config` or
  the Claude login, and reach the network; files that put it in a
  User-Agent, a `mailto:` link or an `email=` parameter; WebFetch, WebSearch
  and browser tools; other MCP tools that pass it beside a URL. The model is
  told to redo the call without it. Local uses pass: a file path, a
  document, a database query. The
  [table in the README](https://github.com/francesco-stimola/claude-email-guard/blob/main/README.md#what-it-blocks)
  has an example for each.
- **Addresses found on their own.** The Claude login (`~/.claude.json`) and
  git's global config, matched in any letter case and URL-encoded;
  `extraEmails` adds more.
- **Inside Claude Code.** A hooks module: no Node, Python or shell, nothing
  started per tool call, and a check that fails holds the call back.
- **Release assets.** `email-guard-1.0.0.plugin`, the mod packed as a plugin
  file, and `SHA256SUMS`.
