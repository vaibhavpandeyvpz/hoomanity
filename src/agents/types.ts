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
