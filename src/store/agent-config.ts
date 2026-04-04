import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { AgentNotFoundError } from "./errors.js";
import { AgentConfigSchema, type AgentConfig } from "./types.js";
import { agentConfigPath } from "./paths.js";

export async function read(agentId: string): Promise<AgentConfig> {
  const p = agentConfigPath(agentId);
  let raw: string;
  try {
    raw = await readFile(p, "utf8");
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      throw new AgentNotFoundError(agentId);
    }
    throw e;
  }
  const parsed = JSON.parse(raw) as unknown;
  return AgentConfigSchema.parse(parsed);
}

export async function write(
  agentId: string,
  config: AgentConfig,
): Promise<void> {
  const p = agentConfigPath(agentId);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}
