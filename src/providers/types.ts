import type { Model } from "@openai/agents";
import type { generateText } from "ai";
import { z, type ZodTypeAny } from "zod";
import {
  AnthropicProviderConfigSchema,
  type AnthropicProviderConfig,
} from "./anthropic.js";
import {
  BedrockProviderConfigSchema,
  type BedrockProviderConfig,
} from "./bedrock.js";
import {
  OpenAIProviderConfigSchema,
  type OpenAIProviderConfig,
} from "./openai.js";
import {
  OllamaProviderConfigSchema,
  type OllamaProviderConfig,
} from "./ollama.js";

export const ModelProviderSchema = z.enum([
  "openai",
  "anthropic",
  "bedrock",
  "ollama",
]);
export type ModelProvider = z.infer<typeof ModelProviderSchema>;

export {
  AnthropicProviderConfigSchema,
  BedrockProviderConfigSchema,
  OpenAIProviderConfigSchema,
  OllamaProviderConfigSchema,
};

export type {
  AnthropicProviderConfig,
  BedrockProviderConfig,
  OpenAIProviderConfig,
  OllamaProviderConfig,
};

/** Must match persisted `AgentConfig.provider` values. */
export type LlmProviderKey = ModelProvider;

/** Ink wizard row for a provider option (no domain / app imports). */
export type ProviderWizardField = {
  readonly key: string;
  readonly label: string;
  /** When true, UI shows a red * next to the label. */
  readonly required: boolean;
  /** Shown dimmed under the label; omit when the label + required flag are enough. */
  readonly hint?: string;
  readonly mask?: string;
};

export type ProviderWizard = {
  readonly displayLabel: string;
  readonly defaultModelId: string;
  readonly fields: readonly ProviderWizardField[];
};

/**
 * Language model handle accepted by Vercel AI SDK {@link generateText} (e.g. tool-approval copy).
 * Distinct from Agents SDK {@link Model} returned by {@link ILlmProvider.create}.
 */
export type AiSdkTextModel = Parameters<typeof generateText>[0]["model"];

/**
 * Pluggable model backend: Zod shape + AI SDK construction.
 * Implementations should depend only on npm packages and local modules under `providers/`.
 */
export interface ILlmProvider {
  readonly key: LlmProviderKey;

  wizard(): ProviderWizard;

  /** Zod schema for this provider’s options object (stored branch on agent config). */
  schema(): ZodTypeAny;

  create(options: Record<string, unknown>, model: string): Model;

  /**
   * Same underlying model as {@link create} before the Agents `aisdk()` wrap — for `generateText`
   * from the `ai` package.
   */
  createLanguageModel(
    options: Record<string, unknown>,
    model: string,
  ): AiSdkTextModel;

  /**
   * Normalize wizard/draft values for persistence (trim empties, drop branch if unused).
   */
  normalize(raw: unknown): Record<string, unknown> | undefined;
}
