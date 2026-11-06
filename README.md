<div align="center">

  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="assets/logo-light.png">
    <img alt="claude-email-guard" src="assets/logo-light.png" width="62%">
  </picture>

### Your email address stays on your machine

**Claude Code hands your address to the model. This mod takes it back, and refuses every tool call that would send it out.**

No prompts · runs inside Claude Code · nothing to configure · fails closed

[![Latest release](https://img.shields.io/github/v/tag/francesco-stimola/claude-email-guard?sort=semver&label=release)](https://github.com/francesco-stimola/claude-email-guard/tags)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Tested on Claude Code 2.1.318](https://img.shields.io/badge/tested%20on-Claude%20Code%202.1.318-5b40c4.svg)](#quick-start)
[![Dependencies: none](https://img.shields.io/badge/dependencies-none-green.svg)](#how-it-works)

[Quick start](#quick-start) · [What it blocks](#what-it-blocks) · [How it works](#how-it-works) · [Options](#options) · [Limits](#limits)

</div>

---

## The problem

Claude Code tells the model the email address of the account you are signed in
with, in a context block named `userEmail`. Some services ask automated clients
to identify themselves in the User-Agent, often with a contact address
(OpenStreetMap's Nominatim, SEC EDGAR, Wikipedia's API), and the model has been
filling that in with yours, without asking
([anthropics/claude-code#107757](https://github.com/anthropics/claude-code/issues/107757)).
Once a request has left, your address is in someone else's logs.

As of Claude Code 2.1.318 no setting keeps the address out of the context, and a
guard written as a command hook starts a process on every tool call: it can
outlast its timeout, and a hook that times out lets the call through.

`email-guard` does both jobs from inside Claude Code.

```
   first message                        every tool call
  ┌───────────────────────────┐      ┌────────────────────────────────┐
  │ claudeMd                  │      │ your address, and a way out?   │
  │ userEmail    ──► dropped  │      │   no  ──► the tool runs        │
  │ currentDate               │      │   yes ──► refused; Claude      │
  └───────────────────────────┘      │           redoes it without it │
   the model never reads it          └────────────────────────────────┘
```

## Quick start

At the prompt of a Claude Code terminal session:

```
/plugin install email-guard --marketplace francesco-stimola/claude-email-guard
```

From a shell:

```
claude plugin install email-guard --marketplace francesco-stimola/claude-email-guard
```

In the desktop app, where `/plugin` does not run: click + next to the prompt
box, then Plugins, Add marketplace with `francesco-stimola/claude-email-guard`,
then Add plugin.

Nothing to set up: your addresses are found on their own. To check, start a new
session and ask Claude for your email address. It should not know it.

## What it blocks

| Tool | Refused when | For example |
| --- | --- | --- |
| Bash, PowerShell | the command holds your address, or reads it from `git config` or the Claude login, and reaches the network | `curl -A "bot (you@example.com)" https://…` |
| Write, Edit, NotebookEdit | the file puts your address in a User-Agent, a `mailto:` link or an `email=` parameter | a script that would send it later |
| WebFetch, WebSearch, browser tools | your address appears anywhere in the call | a URL, a form field |
| Other MCP tools | your address appears beside a URL | an HTTP client tool |

Your address matches in any letter case and URL-encoded (`you%40example.com`).
What stays on the machine passes: a file path, a document, a database query.

A refused call goes back to Claude with the reason and what to do instead: redo
it without the address, with a generic User-Agent such as `research-script/1.0`,
and without encoding or splitting the address.

## How it works

- **A hooks module** loaded by Claude Code itself: no Node, Python or shell, and
  no process started per tool call.
- **`prompt.context`** drops the `userEmail` block from the first message's
  context, and again whenever the context is read anew (compaction, `/clear`).
- **`tool.call`** judges each call before the tool runs. If the check itself
  fails on a guarded tool, the call is held back.
- **Protected addresses**: `oauthAccount.emailAddress` in `~/.claude.json` (or
  under `CLAUDE_CONFIG_DIR`), every `email =` line in `~/.gitconfig` and
  `~/.config/git/config`, the address in the `userEmail` block, and
  `extraEmails`.

## Options

Set them with `/plugin configure email-guard@claude-email-guard`.

| Option | Default | What it does |
| --- | --- | --- |
| `extraEmails` | empty | More addresses to protect, separated by commas |
| `keepInContext` | off | Keeps the `userEmail` block; tool calls are guarded either way |

## Limits

- It reads text. An address encoded some other way (base64, split in pieces), or
  read at run time from a file other than the git config, is not seen.
- Email addresses only: names, phone numbers and tokens are not its job.
- Claude Code's own traffic to Anthropic is not touched; Anthropic has your
  account address already.
- When you do want Claude to send your address, it refuses: send it yourself, or
  turn the mod off for a moment from `/plugin`.

## Development

From a local copy of this repository (then restart Claude Code, or run
`/reload-plugins`):

```
claude plugin marketplace add <this folder>
claude plugin install email-guard@claude-email-guard
```

Run the tests with `claude plugin test <this folder>`. The banner is
`assets/src/banner.html`, rendered with a headless Chromium; the command is in
the file.

## License

[MIT](LICENSE)
