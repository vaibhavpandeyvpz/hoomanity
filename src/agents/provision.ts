import { mkdir } from "node:fs/promises";
import { write as writeConfig } from "./config.js";
import { write } from "./instructions.js";
import { append, get } from "./registry.js";
import type { AgentConfig } from "./types.js";
import { generateId } from "./utils/generate-id.js";
import { write as writeMcpFile } from "../mcp/config.js";
import { agentDir, agentSkillsDir } from "../utils/path-helpers.js";
import { defaultMcpFileForNewAgent } from "./default-mcp.js";
import { installDefaultSkillForNewAgent } from "./default-skills.js";

export type ProvisionAgentInput = {
  config: AgentConfig;
  /** Written to ~/.hooman/agents/<id>/INSTRUCTIONS.md */
  instructions: string;
};

/**
 * Creates on-disk agent layout: config, default `mcp.json` (starter MCP servers), skills dir,
 * optional default skills from `vercel-labs/agent-skills` (via `npx skills`), registry line.
 * Skills and MCP entries can still be edited afterward.
 * @returns New agent id (8-character code).
 */
export async function provision(input: ProvisionAgentInput): Promise<string> {
  let agentId = generateId(8);
  for (let i = 0; i < 32; i += 1) {
    const existing = await get(agentId);
    if (!existing) {
      break;
    }
    agentId = generateId(8);
  }

  const dir = agentDir(agentId);
  await mkdir(dir, { recursive: true });
  await mkdir(agentSkillsDir(agentId), { recursive: true });

  await writeConfig(agentId, input.config);
  await write(agentId, input.instructions);
  await writeMcpFile(agentId, defaultMcpFileForNewAgent(agentId));

  try {
    await installDefaultSkillForNewAgent(agentId);
  } catch {
    /* Offline or `npx skills` unavailable; agent works without the bundled default. */
  }

  await append({ id: agentId, enabled: true });
  return agentId;
}
