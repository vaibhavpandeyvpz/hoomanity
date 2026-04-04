import { homedir } from "node:os";
import { join } from "node:path";
import { McpFileSchema, type McpFile } from "../store/types.js";
import { agentDir } from "../store/paths.js";

/**
 * Initial `mcp.json` for newly provisioned agents: common stdio MCPs (npx / uvx).
 * Filesystem server is scoped to the user home directory.
 * Desktop Commander runs shell/process tools with `cwd` set to the user home directory.
 * Memory server stores the knowledge graph at `<agentDir>/memory.jsonl`.
 */
export function defaultMcpFileForNewAgent(agentId: string): McpFile {
  const home = homedir();
  const memoryPath = join(agentDir(agentId), "memory.jsonl");
  return McpFileSchema.parse({
    servers: [
      {
        name: "sequential-thinking",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-sequential-thinking"],
      },
      {
        name: "memory",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-memory"],
        env: {
          MEMORY_FILE_PATH: memoryPath,
        },
      },
      {
        name: "time",
        command: "uvx",
        args: ["mcp-server-time"],
      },
      {
        name: "fetch",
        command: "uvx",
        args: ["mcp-server-fetch"],
      },
      {
        name: "filesystem",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem", home],
      },
      {
        name: "desktop_commander",
        command: "npx",
        args: [
          "-y",
          "@wonderwhy-er/desktop-commander@latest",
          "--no-onboarding",
        ],
        cwd: home,
        toolFilter: {
          allowedToolNames: [
            "start_process",
            "interact_with_process",
            "read_process_output",
            "force_terminate",
            "list_sessions",
            "list_processes",
            "kill_process",
          ],
        },
      },
    ],
  });
}
