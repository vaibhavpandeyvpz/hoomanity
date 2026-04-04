import {
  McpFileSchema,
  McpServerSchema,
  type McpFile,
  type McpServerEntry,
  type McpUrlTransport,
} from "./types.js";
import { read as readMcpFile, write as writeMcpFile } from "./mcp-config.js";

export type McpListEntry = {
  index: number;
  kind: "stdio" | "streamableHttp" | "sse";
  name: string;
  summary: string;
};

export type AddMcpStdioFullCommandInput = {
  kind: "stdio";
  mode: "fullCommand";
  fullCommand: string;
  name?: string;
};

export type AddMcpStdioCommandInput = {
  kind: "stdio";
  mode: "command";
  command: string;
  args?: string[];
  name?: string;
};

export type AddMcpUrlInput = {
  kind: "url";
  url: string;
  transport?: McpUrlTransport;
  name?: string;
};

export type AddMcpServerInput =
  | AddMcpStdioFullCommandInput
  | AddMcpStdioCommandInput
  | AddMcpUrlInput;

function entryFromMerged(merged: McpServerEntry): McpServerEntry {
  const url = merged.url?.trim();
  if (url) {
    const entry: McpServerEntry = { url };
    if (merged.name?.trim()) {
      entry.name = merged.name.trim();
    }
    if (merged.transport === "sse" || merged.transport === "streamableHttp") {
      entry.transport = merged.transport;
    }
    return McpServerSchema.parse(entry);
  }
  if (merged.fullCommand?.trim()) {
    const entry: McpServerEntry = { fullCommand: merged.fullCommand.trim() };
    if (merged.name?.trim()) {
      entry.name = merged.name.trim();
    }
    if (merged.env && Object.keys(merged.env).length > 0) {
      entry.env = merged.env;
    }
    if (merged.cwd?.trim()) {
      entry.cwd = merged.cwd.trim();
    }
    if (merged.toolFilter) {
      entry.toolFilter = merged.toolFilter;
    }
    return McpServerSchema.parse(entry);
  }
  if (merged.command?.trim()) {
    const entry: McpServerEntry = {
      command: merged.command.trim(),
      args: merged.args ?? [],
    };
    if (merged.name?.trim()) {
      entry.name = merged.name.trim();
    }
    if (merged.env && Object.keys(merged.env).length > 0) {
      entry.env = merged.env;
    }
    if (merged.cwd?.trim()) {
      entry.cwd = merged.cwd.trim();
    }
    if (merged.toolFilter) {
      entry.toolFilter = merged.toolFilter;
    }
    return McpServerSchema.parse(entry);
  }
  throw new Error("Invalid MCP server entry after update");
}

/**
 * CRUD for an agent’s `mcp.json` (stdio or URL MCP servers), analogous to `SkillsRegistry` for skills.
 */
export class McpRegistry {
  async read(agentId: string): Promise<McpFile> {
    return readMcpFile(agentId);
  }

  async list(agentId: string): Promise<McpListEntry[]> {
    const mcp = await readMcpFile(agentId);
    return mcp.servers.map((s, index) => {
      const url = s.url?.trim();
      if (url) {
        const t = s.transport ?? "streamableHttp";
        return {
          index,
          kind: t === "sse" ? "sse" : "streamableHttp",
          name: s.name?.trim() || `mcp-${index}`,
          summary: url,
        };
      }
      const summary = s.fullCommand?.trim()
        ? s.fullCommand
        : [s.command, ...(s.args ?? [])].filter(Boolean).join(" ");
      return {
        index,
        kind: "stdio",
        name: s.name?.trim() || `mcp-${index}`,
        summary,
      };
    });
  }

  async add(agentId: string, input: AddMcpServerInput): Promise<void> {
    const mcp = await readMcpFile(agentId);
    let entry: McpServerEntry;
    if (input.kind === "url") {
      const url = input.url.trim();
      if (!url) {
        throw new Error("MCP url cannot be empty");
      }
      entry = { url, name: input.name, transport: input.transport };
    } else if (input.mode === "fullCommand") {
      const fullCommand = input.fullCommand.trim();
      if (!fullCommand) {
        throw new Error("MCP fullCommand cannot be empty");
      }
      entry = { fullCommand, name: input.name };
    } else {
      const command = input.command.trim();
      if (!command) {
        throw new Error("MCP command cannot be empty");
      }
      entry = { command, args: input.args ?? [], name: input.name };
    }
    const parsed = McpServerSchema.parse(entry);
    const next: McpFile = { servers: [...mcp.servers, parsed] };
    await writeMcpFile(agentId, McpFileSchema.parse(next));
  }

  async update(
    agentId: string,
    index: number,
    patch: Partial<McpServerEntry>,
  ): Promise<void> {
    const mcp = await readMcpFile(agentId);
    if (index < 0 || index >= mcp.servers.length) {
      throw new Error(`No MCP server at index ${index}`);
    }
    const merged: McpServerEntry = { ...mcp.servers[index], ...patch };
    const nextEntry = entryFromMerged(merged);
    const servers = mcp.servers.slice();
    servers[index] = nextEntry;
    await writeMcpFile(agentId, McpFileSchema.parse({ servers }));
  }

  async remove(agentId: string, index: number): Promise<void> {
    const mcp = await readMcpFile(agentId);
    if (index < 0 || index >= mcp.servers.length) {
      throw new Error(`No MCP server at index ${index}`);
    }
    const servers = mcp.servers.filter((_, i) => i !== index);
    await writeMcpFile(agentId, McpFileSchema.parse({ servers }));
  }
}
