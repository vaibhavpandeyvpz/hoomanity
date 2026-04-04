import type { Model } from "@openai/agents";
import type { AgentConfig } from "../store/types.js";
import type { ModelProvider } from "./types.js";
import type { ILlmProvider } from "./types.js";

export type LlmProviderLookup = {
  get(key: ModelProvider): ILlmProvider;
};

/** Provider branch options for `config` (passed to {@link ILlmProvider.create}). */
export function agentProviderOptions(
  config: AgentConfig,
): Record<string, unknown> {
  switch (config.provider) {
    case "openai":
      return { ...(config.openai as Record<string, unknown> | undefined) };
    case "anthropic":
      return { ...(config.anthropic as Record<string, unknown> | undefined) };
    case "bedrock":
      return { ...(config.bedrock as Record<string, unknown> | undefined) };
    case "ollama":
      return { ...(config.ollama as Record<string, unknown> | undefined) };
    default:
      throw new Error(`Unknown provider: ${String(config.provider)}`);
  }
}

/** AI SDK {@link Model} for `config` via the registered LLM provider. */
export function create(
  registry: LlmProviderLookup,
  config: AgentConfig,
): Model {
  const opts = {
    ...agentProviderOptions(config),
    reasoningEnabled: config.reasoningEnabled,
  };
  return registry.get(config.provider).create(opts, config.model.trim());
}
