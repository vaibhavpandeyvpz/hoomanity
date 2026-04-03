# hooman

Interactive terminal UI for running and configuring local AI agents (OpenAI Agents SDK, Recollect-backed session memory, MCP, and skills).

**Requirements:** [Node.js](https://nodejs.org/) 20+

## Install

```bash
npm install -g hooman
```

Run the main menu:

```bash
hooman
```

Open the configuration wizard (agents, MCP, timeouts, provider credentials):

```bash
hooman configure
```

## Use with npx (no global install)

```bash
npx hooman
npx hooman configure
```

## Data on disk

- Agent registry and configs: `~/.hooman/` (per-agent folders, `agents.jsonl`, etc.)
- Recollect session files: `~/.hooman/agents/<AGENT_ID>/sessions/`

API keys can be stored in agent config via **configure** or supplied via provider-specific environment variables (see the wizard hints for OpenAI, Anthropic, Bedrock, Ollama).

## Publish (maintainers)

The published tarball includes `dist/` (compiled JS, types, bundled prompt `.md` files), `package.json`, `README.md`, and `LICENSE`. Source and `scripts/` are not published.

```bash
npm ci
npm publish
```

`prepublishOnly` runs a clean `npm run build` (`rimraf dist`, `tsc`, copy prompts) before pack/publish.

If the unscoped name `hooman` is already taken on the registry, use a scoped name (e.g. `@your-org/hooman`), set `"name"` in `package.json`, and document `npx @your-org/hooman` for users.

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
