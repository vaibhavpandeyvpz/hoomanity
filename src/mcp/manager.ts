import {
  MCPServerSSE,
  MCPServerStdio,
  MCPServerStreamableHttp,
  connectMcpServers,
  type MCPServer,
  type MCPServersOptions,
} from "@openai/agents";
import { read as readMcpFile } from "./config.js";
import type { McpFile, McpToolFilterStatic } from "./types.js";

export type McpAgentConnection = {
  servers: MCPServer[];
  close: () => Promise<void>;
};

export type CreateForAgentOptions = Pick<
  MCPServersOptions,
  "connectTimeoutMs" | "closeTimeoutMs"
> & {
  /**
   * Per-request JSON-RPC timeouts inside @modelcontextprotocol/sdk (initialize, listTools, etc.).
   * Without this, stdio/SSE/HTTP clients default to ~5s session timeout — unrelated to
   * {@link MCPServersOptions.connectTimeoutMs}.
   */
  mcpRpcTimeoutMs?: number;
};

function mcpSdkTimeoutOptions(rpcTimeoutMs: number | undefined): {
  clientSessionTimeoutSeconds?: number;
  timeout?: number;
} {
  if (rpcTimeoutMs === undefined) {
    return {};
  }
  return {
    clientSessionTimeoutSeconds: Math.max(1, Math.ceil(rpcTimeoutMs / 1000)),
    timeout: rpcTimeoutMs,
  };
}

function normalizedToolFilter(
  tf: McpToolFilterStatic | undefined,
): McpToolFilterStatic | undefined {
  if (!tf) {
    return undefined;
  }
  const allowed = tf.allowedToolNames?.filter((n) => n.length > 0);
  const blocked = tf.blockedToolNames?.filter((n) => n.length > 0);
  if (!allowed?.length && !blocked?.length) {
    return undefined;
  }
  return {
    ...(allowed?.length ? { allowedToolNames: allowed } : {}),
    ...(blocked?.length ? { blockedToolNames: blocked } : {}),
  };
}

function stdioServerOptions(s: {
  env?: Record<string, string>;
  cwd?: string;
  toolFilter?: McpToolFilterStatic;
}) {
  const toolFilter = normalizedToolFilter(s.toolFilter);
  return {
    ...(s.env && Object.keys(s.env).length > 0 ? { env: s.env } : {}),
    ...(s.cwd?.trim() ? { cwd: s.cwd.trim() } : {}),
    ...(toolFilter ? { toolFilter } : {}),
  };
}

function serversFromMcpFile(mcp: McpFile, rpcTimeoutMs?: number): MCPServer[] {
  const t = mcpSdkTimeoutOptions(rpcTimeoutMs);
  const out: MCPServer[] = [];
  for (const s of mcp.servers) {
    const url = s.url?.trim();
    if (url) {
      const transport = s.transport ?? "streamableHttp";
      const tf = normalizedToolFilter(s.toolFilter);
      const urlOpts = {
        url,
        name: s.name,
        ...(tf ? { toolFilter: tf } : {}),
        ...t,
      };
      if (transport === "sse") {
        out.push(new MCPServerSSE(urlOpts));
      } else {
        out.push(new MCPServerStreamableHttp(urlOpts));
      }
      continue;
    }
    if (s.fullCommand) {
      out.push(
        new MCPServerStdio({
          name: s.name,
          fullCommand: s.fullCommand,
          ...stdioServerOptions(s),
          ...t,
        }),
      );
    } else if (s.command) {
      out.push(
        new MCPServerStdio({
          name: s.name,
          command: s.command,
          args: s.args ?? [],
          ...stdioServerOptions(s),
          ...t,
        }),
      );
    }
  }
  return out;
}

/**
 * Loads an agent's `mcp.json`, builds SDK MCP server instances, and connects them.
 */
export async function createForAgent(
  agentId: string,
  options?: CreateForAgentOptions,
): Promise<McpAgentConnection> {
  const { mcpRpcTimeoutMs, ...connectOpts } = options ?? {};
  const mcp = await readMcpFile(agentId);
  const created = serversFromMcpFile(mcp, mcpRpcTimeoutMs);
  if (created.length === 0) {
    return {
      servers: [],
      close: async () => {},
    };
  }
  const bundle = await connectMcpServers(created, {
    connectInParallel: true,
    dropFailed: true,
    strict: false,
    ...connectOpts,
  });
  return {
    // `bundle.all` includes servers that failed to connect; tools must use `active` only.
    servers: bundle.active,
    close: () => bundle.close(),
  };
}
