import { z } from "zod";

/** Remote MCP transport when `url` is set (defaults to streamable HTTP at runtime if omitted). */
export const McpUrlTransportSchema = z.enum(["streamableHttp", "sse"]);
export type McpUrlTransport = z.infer<typeof McpUrlTransportSchema>;

/** Matches SDK `MCPToolFilterStatic` for stdio / URL MCP servers in `mcp.json`. */
export const McpToolFilterStaticSchema = z.object({
  allowedToolNames: z.array(z.string()).optional(),
  blockedToolNames: z.array(z.string()).optional(),
});
export type McpToolFilterStatic = z.infer<typeof McpToolFilterStaticSchema>;

/** One MCP server in `mcp.json`: either stdio (`fullCommand` or `command`) or remote (`url`). */
export const McpServerSchema = z
  .object({
    name: z.string().optional(),
    fullCommand: z.string().optional(),
    command: z.string().optional(),
    args: z.array(z.string()).optional(),
    /** Merged with `process.env` when spawning stdio MCP servers. */
    env: z.record(z.string(), z.string()).optional(),
    /** Working directory for stdio MCP subprocess (ignored for `url` servers). */
    cwd: z.string().optional(),
    /** Static tool allow/block lists (`MCPServerStdio` / remote server `toolFilter`). */
    toolFilter: McpToolFilterStaticSchema.optional(),
    url: z.string().optional(),
    transport: McpUrlTransportSchema.optional(),
  })
  .superRefine((s, ctx) => {
    const url = s.url?.trim();
    const hasStdio =
      Boolean(s.fullCommand?.trim()) || Boolean(s.command?.trim());
    if (url && hasStdio) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "MCP server cannot set both url and command/fullCommand",
      });
    }
    if (!url && !hasStdio) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Each MCP server needs url or fullCommand or command",
      });
    }
    if (s.transport !== undefined && !url) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "transport is only valid with url",
      });
    }
  });

export type McpServerEntry = z.infer<typeof McpServerSchema>;

/** JSON shape for the MCP file (`AGENT_MCP_BASENAME` in `agents/files.ts`). */
export const McpFileSchema = z.object({
  servers: z.array(McpServerSchema).default([]),
});

export type McpFile = z.infer<typeof McpFileSchema>;
