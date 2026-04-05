import {
  MCPServerSSE,
  MCPServerStdio,
  MCPServerStreamableHttp,
  connectMcpServers,
  type MCPServer,
  type MCPServersOptions,
} from "@openai/agents";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { log } from "../logging/app-logger.js";
import { read as readMcpFile } from "../store/mcp-config.js";
import type { McpFile, McpToolFilterStatic } from "../store/types.js";

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

/**
 * Forward MCP child stderr (piped by {@link StdioClientTransport}) into the app logger.
 * Attach before `connect()` so early process output is not lost (per SDK docs).
 */
function pipeMcpStdioToAppLog(
  transport: StdioClientTransport,
  serverName: string,
): void {
  const stream = transport.stderr;
  if (!stream || typeof stream.on !== "function") {
    return;
  }
  let carry = "";
  stream.on("data", (chunk: Buffer | string) => {
    carry += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    const parts = carry.split(/\r?\n/);
    carry = parts.pop() ?? "";
    for (const line of parts) {
      const t = line.trim();
      if (t) {
        log.info(`[mcp:${serverName}] ${t}`);
      }
    }
  });
  stream.on("end", () => {
    const t = carry.trim();
    if (t) {
      log.info(`[mcp:${serverName}] ${t}`);
    }
    carry = "";
  });
  stream.on("error", (err: unknown) => {
    log.warn(`[mcp:${serverName}] stderr stream error`, err);
  });
}

/** Internal shape of {@link MCPServerStdio} used by our `connect` override (not exported by the SDK). */
type McpStdioServerUnderlying = {
  params: {
    command: string;
    args: string[];
    env?: Record<string, string>;
    cwd?: string;
  };
  transport?: StdioClientTransport;
  session: Client;
  _name: string;
  clientSessionTimeoutSeconds?: number;
  serverInitializeResult?: {
    serverInfo: { name: string; version: string };
  };
  close(): Promise<void>;
};

class QuietMCPServerStdio extends MCPServerStdio {
  override async connect(): Promise<void> {
    const u = (this as unknown as { underlying: McpStdioServerUnderlying })
      .underlying;
    const { command, args, env, cwd } = u.params;

    u.transport = new StdioClientTransport({
      command,
      args,
      env,
      cwd,
      stderr: "pipe",
    });
    pipeMcpStdioToAppLog(u.transport, u._name);

    u.session = new Client({
      name: u._name,
      version: "1.0.0",
    });

    const requestOptions = u.clientSessionTimeoutSeconds
      ? { timeout: u.clientSessionTimeoutSeconds * 1000 }
      : undefined;

    try {
      await u.session.connect(u.transport, requestOptions);
      u.serverInitializeResult = {
        serverInfo: { name: u._name, version: "1.0.0" },
      };
    } catch (e) {
      await u.close();
      throw e;
    }
  }
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
        new QuietMCPServerStdio({
          name: s.name,
          fullCommand: s.fullCommand,
          ...stdioServerOptions(s),
          ...t,
        }),
      );
    } else if (s.command) {
      out.push(
        new QuietMCPServerStdio({
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
  const servers = await connectMcpServers(created, {
    connectInParallel: true,
    dropFailed: true,
    strict: false,
    ...connectOpts,
  });
  return {
    // `servers.all` includes servers that failed to connect; tools must use `active` only.
    servers: servers.active,
    close: () => servers.close(),
  };
}
