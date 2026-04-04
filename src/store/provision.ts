import { mkdir } from "node:fs/promises";
import { agentDir } from "./paths.js";
import { write as writeConfig } from "./agent-config.js";
import { write as writeInstructions } from "./instructions.js";
import { write as writeMcp } from "./mcp-config.js";
import { append as appendToRegistry } from "./agent-registry.js";
import { defaultMcpFileForNewAgent } from "../mcp/defaults.js";
import type { AgentConfig } from "./types.js";

export type ProvisionOptions = {
  readonly config: AgentConfig;
  readonly instructions: string;
};

/**
 * Creates the on-disk structure for a new agent and adds it to the registry.
 * Returns the generated/provided agent ID.
 */
export async function provision(options: ProvisionOptions): Promise<string> {
  const id = options.config.name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "_");
  const dir = agentDir(id);

  await mkdir(dir, { recursive: true });

  await writeConfig(id, options.config);
  await writeInstructions(id, options.instructions);
  await writeMcp(id, defaultMcpFileForNewAgent(id));

  await appendToRegistry({
    id,
    enabled: true,
  });

  return id;
}
