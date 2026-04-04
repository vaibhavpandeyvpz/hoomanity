import type { ModelSettings } from "@openai/agents";
import type { AgentConfig } from "../store/types.js";

/** Whether to stream/show reasoning in the UI (default: true when omitted). */
export function resolvedReasoningEnabled(config: AgentConfig): boolean {
  return config.reasoningEnabled !== false;
}

/**
 * When reasoning is disabled, turn off OpenAI-style reasoning effort for the Agents SDK.
 * Ollama `think` is controlled in the Ollama provider via the same flag.
 */
export function agentModelSettings(config: AgentConfig): ModelSettings {
  if (config.reasoningEnabled === false) {
    return { reasoning: { effort: "none" } };
  }
  return {};
}
