import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { AGENT_INSTRUCTIONS_BASENAME } from "./files.js";
import { agentInstructionsPath } from "./paths.js";

export { AGENT_INSTRUCTIONS_BASENAME };

export async function read(agentId: string): Promise<string> {
  try {
    return await readFile(agentInstructionsPath(agentId), "utf8");
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      return "";
    }
    throw e;
  }
}

export async function write(agentId: string, body: string): Promise<void> {
  const p = agentInstructionsPath(agentId);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, body, "utf8");
}
