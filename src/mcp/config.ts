import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { McpFileSchema, type McpFile } from "./types.js";
import { agentMcpPath } from "../utils/path-helpers.js";

const DEFAULT: McpFile = { servers: [] };

export async function read(agentId: string): Promise<McpFile> {
  const p = agentMcpPath(agentId);
  try {
    const raw = await readFile(p, "utf8");
    return McpFileSchema.parse(JSON.parse(raw) as unknown);
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      return DEFAULT;
    }
    throw e;
  }
}

export async function write(agentId: string, mcp: McpFile): Promise<void> {
  const p = agentMcpPath(agentId);
  await mkdir(dirname(p), { recursive: true });
  const parsed = McpFileSchema.parse(mcp);
  await writeFile(p, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
}
