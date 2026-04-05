<div align="center">

# hoomanity

**Terminal UI for local AI agents:** OpenAI Agents SDK, Recollect session memory, MCP tools, Vercel [skills](https://skills.sh/) integration, and multi-channel chat (CLI, Slack, WhatsApp).

[![npm version](https://img.shields.io/npm/v/hoomanity.svg?style=flat-square)](https://www.npmjs.com/package/hoomanity)
[![Node.js Version](https://img.shields.io/node/v/hoomanity.svg?style=flat-square)](https://nodejs.org/)
[![Build Status](https://img.shields.io/github/actions/workflow/status/vaibhavpandeyvpz/hoomanity/build-publish.yml?branch=main&style=flat-square)](https://github.com/vaibhavpandeyvpz/hoomanity/actions)
[![TypeScript](https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg?style=flat-square)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

<br/>
<img src=".github/screenshot.png" alt="hoomanity interface" width="800" />
<br/>
<br/>

</div>

**Requirements:** [Node.js](https://nodejs.org/) 24+

## Install

```bash
npm install -g hoomanity
```

```bash
hoomanity              # pick an agent, then channel and session options
hoomanity configure    # create/edit agents, MCP, skills, channels, timeouts
```

## Use with npx (no global install)

```bash
npx hoomanity
npx hoomanity configure
```

## Running agents

After you choose an **agent**, you choose a **channel**:

| Channel      | What happens                                                                                                                                                                                                                                                                                          |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CLI**      | Pick a Recollect session (or start a new one), then chat in the terminal.                                                                                                                                                                                                                             |
| **Slack**    | Choose **single** (one shared memory for all conversations) or **multi** (separate memory per channel/DM). Connects with **Socket Mode** (Bolt). Configure tokens and secrets under **configure → Channels → Slack** (bot and/or user token, signing secret, app-level token with Socket Mode scope). |
| **WhatsApp** | Similar **single / multi** memory choice. Scan the QR code in the terminal; session data is stored locally per agent.                                                                                                                                                                                 |

Non-interactive shortcuts (e.g. scripts or launchers):

```bash
hoomanity <AGENT_ID> --channel slack --bot-memory multi
hoomanity --agent <AGENT_ID> --channel whatsapp --bot-memory single
```

`--bot-memory` is `single` or `multi`; omit it in the TUI to choose on the bot-memory screen.

## Configure wizard

From **hoomanity configure** you can:

- Create, enable/disable, or delete agents; edit model provider and agent instructions
- **Skills** (Vercel-style skill folders) and **MCP** servers (stdio / URL)
- **Channels**: Slack and WhatsApp credentials (see above)
- **Timeouts** and loop limits per agent

Provider API keys live in agent config or in provider-specific environment variables (hints appear in the wizard).

## Data on disk

Default root: **`~/.hoomanity/`**

- Agent registry, per-agent config, instructions, `mcp.json`, and related files under `agents/<AGENT_ID>/`
- Recollect sessions and chat history: `agents/<AGENT_ID>/sessions/` (plus per-session **attachments** where used)
- Optional logs: `~/.hoomanity/logs/`

## Providers

Models are wired through the Vercel AI SDK and `@openai/agents-extensions` (`aisdk`). Supported providers include **OpenAI**, **Anthropic**, **Amazon Bedrock**, and **[Ollama](https://github.com/jagreehal/ai-sdk-ollama)** (via `ai-sdk-ollama`).

## Publish (maintainers)

The published tarball includes `dist/` (compiled JS, types, bundled prompt `.md` files), `package.json`, `README.md`, and `LICENSE`. Source and `scripts/` are not published.

```bash
npm ci
npm publish
```

`prepublishOnly` runs a clean `npm run build` (`rimraf dist`, `tsc`, copy prompts) before pack/publish.

### Install from a Git clone

`dist/` is not committed. After cloning:

```bash
npm ci
npm run build
npm link   # or: npm install -g .
```

## License

MIT — see [LICENSE](./LICENSE).
