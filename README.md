<div align="center">

# hoomanity

**Interactive terminal UI for running and configuring local AI agents (OpenAI Agents SDK, Recollect-backed session memory, MCP, and skills).**

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

Run the main menu:

```bash
hoomanity
```

Open the configuration wizard (agents, MCP, timeouts, provider credentials):

```bash
hoomanity configure
```

## Use with npx (no global install)

```bash
npx hoomanity
npx hoomanity configure
```

## Data on disk

- Agent registry and configs: `~/.hoomanity/` (per-agent folders, `agents.jsonl`, etc.)
- Recollect session files: `~/.hoomanity/agents/<AGENT_ID>/sessions/`

API keys can be stored in agent config via **configure** or supplied via provider-specific environment variables (see the wizard hints for OpenAI, Anthropic, Bedrock, Ollama).

## Publish (maintainers)

The published tarball includes `dist/` (compiled JS, types, bundled prompt `.md` files), `package.json`, `README.md`, and `LICENSE`. Source and `scripts/` are not published.

```bash
npm ci
npm publish
```

`prepublishOnly` runs a clean `npm run build` (`rimraf dist`, `tsc`, copy prompts) before pack/publish.

If the unscoped name `hoomanity` is already taken on the registry, use a scoped name (e.g. `@your-org/hoomanity`), set `"name"` in `package.json`, and document `npx @your-org/hoomanity` for users.

### Install from a Git clone

`dist/` is not committed. After cloning:

```bash
npm ci
npm run build
npm link   # or: npm install -g .
```

## Providers

Models are wired through the Vercel AI SDK and `@openai/agents-extensions` (`aisdk`). Supported providers include OpenAI, Anthropic, Amazon Bedrock, and [Ollama](https://github.com/jagreehal/ai-sdk-ollama).

## License

MIT — see [LICENSE](./LICENSE).
