import { z } from "zod";
import {
  AnthropicProviderConfigSchema,
  BedrockProviderConfigSchema,
  ModelProviderSchema,
  OllamaProviderConfigSchema,
  OpenAIProviderConfigSchema,
  type AnthropicProviderConfig,
  type BedrockProviderConfig,
  type OllamaProviderConfig,
  type OpenAIProviderConfig,
} from "../providers/types.js";

/** Optional per-agent limits; omitted keys fall back to defaults in `resolvedAgentTimeouts`. */
export const AgentTimeoutsSchema = z
  .object({
    turnTimeoutMs: z.number().int().positive().max(86_400_000).optional(),
    toolCallTimeoutMs: z.number().int().positive().max(86_400_000).optional(),
    mcpConnectTimeoutMs: z.number().int().positive().max(600_000).optional(),
  })
  .strict();

export type AgentTimeouts = z.infer<typeof AgentTimeoutsSchema>;

export const SlackConfigSchema = z
  .object({
    /** Bot token (xoxb-...). Optional if {@link userToken} alone is used for Bolt + API. */
    token: z.string().default(""),
    signingSecret: z.string().min(1),
    appToken: z.string().min(1),
    /**
     * User OAuth token (e.g. xoxp-...). May be the only token (Bolt + Web API + file downloads).
     * Required whenever {@link token} is set (file access).
     */
    userToken: z.string().default(""),
  })
  .superRefine((data, ctx) => {
    const bot = data.token.trim();
    const user = data.userToken.trim();
    if (!bot && !user) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Set a user token by itself, or a bot token together with a user token.",
        path: ["userToken"],
      });
    }
    if (bot && !user) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "User token is required when a bot token is set (required for file access).",
        path: ["userToken"],
      });
    }
  });
export type SlackConfig = z.infer<typeof SlackConfigSchema>;

export const WhatsAppConfigSchema = z.object({
  sessionName: z.string().min(1).default("default"),
});
export type WhatsAppConfig = z.infer<typeof WhatsAppConfigSchema>;

/**
 * JSON shape for the agent config file (`AGENT_CONFIG_BASENAME` in `agents/files.ts`).
 * System instructions use `AGENT_INSTRUCTIONS_BASENAME` on disk, not this object.
 */
export const AgentConfigSchema = z.object({
  name: z.string().min(1),
  provider: ModelProviderSchema,
  /** AI SDK model id (provider-specific). */
  model: z.string().min(1),
  /** Used when provider is openai — maps to createOpenAI(...) options. */
  openai: OpenAIProviderConfigSchema.optional(),
  /** Used when provider is anthropic — maps to createAnthropic(...) options. */
  anthropic: AnthropicProviderConfigSchema.optional(),
  /** Used when provider is bedrock — maps to createAmazonBedrock(...) options. */
  bedrock: BedrockProviderConfigSchema.optional(),
  /** Used when provider is ollama — maps to ai-sdk-ollama `createOllama` options. */
  ollama: OllamaProviderConfigSchema.optional(),
  timeouts: AgentTimeoutsSchema.optional(),
  /**
   * Max agent loop iterations per user message (`run` maxTurns). Default 100 when omitted.
   */
  maxTurns: z.number().int().min(1).max(10_000).optional(),
  /**
   * Assumed context window size (tokens) for the status bar usage bar. Default 50K when omitted.
   */
  maxContextTokens: z.number().int().min(1024).max(10_000_000).optional(),
  /**
   * When false, disables reasoning/thinking where supported (Ollama `think`, OpenAI reasoning effort).
   * When true or omitted, uses provider defaults (Ollama requests thinking; OpenAI default reasoning).
   */
  reasoningEnabled: z.boolean().optional(),
  /**
   * When true, non-image inbound attachments are sent as `input_file` parts (data URLs).
   * Images still use `input_image` when MIME is jpeg/png/gif/webp.
   */
  enableFileInput: z.boolean().optional(),
  /**
   * Max total size (MB) of files under each session’s `attachments/` dir; oldest files are
   * deleted when exceeded. Default 512 when omitted.
   */
  inboundAttachmentsMaxMb: z.number().int().min(16).max(50_000).optional(),
  slack: SlackConfigSchema.optional(),
  whatsapp: WhatsAppConfigSchema.optional(),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

export type AgentConfigBase = Omit<
  AgentConfig,
  "openai" | "anthropic" | "bedrock" | "ollama"
>;

export type ProviderConfigDrafts = {
  openai: OpenAIProviderConfig;
  anthropic: AnthropicProviderConfig;
  bedrock: BedrockProviderConfig;
  ollama: OllamaProviderConfig;
};

/** One line in ~/.hoomanity/agents.jsonl */
export const AgentRegistryEntrySchema = z.object({
  id: z.string().length(8),
  enabled: z.boolean(),
});

export type AgentRegistryEntry = z.infer<typeof AgentRegistryEntrySchema>;

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
