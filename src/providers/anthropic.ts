import type { LanguageModelV3 } from "@ai-sdk/provider";
import { createAnthropic } from "@ai-sdk/anthropic";
import { aisdk } from "@openai/agents-extensions/ai-sdk";
import { z } from "zod";
import type { ILlmProvider, ProviderWizard } from "./types.js";

/** Anthropic provider options (AI SDK createAnthropic). */
export const AnthropicProviderConfigSchema = z.object({
  apiKey: z.string().optional(),
  baseURL: z.string().optional(),
});

export type AnthropicProviderConfig = z.infer<
  typeof AnthropicProviderConfigSchema
>;

export class AnthropicLlmProvider implements ILlmProvider {
  readonly key = "anthropic";

  wizard(): ProviderWizard {
    return {
      displayLabel: "Anthropic",
      defaultModelId: "claude-sonnet-4-20250514",
      fields: [
        {
          key: "apiKey",
          label: "Anthropic API key",
          required: true,
          hint: "Leave empty to use ANTHROPIC_API_KEY from the environment",
          mask: "*",
        },
        {
          key: "baseURL",
          label: "API base URL",
          required: false,
          hint: "Optional. Defaults to https://api.anthropic.com/v1 when empty",
        },
      ],
    };
  }

  schema() {
    return AnthropicProviderConfigSchema;
  }

  normalize(raw: unknown): Record<string, unknown> | undefined {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      return undefined;
    }
    const parsed = AnthropicProviderConfigSchema.safeParse(raw);
    if (!parsed.success) {
      return undefined;
    }
    const o = parsed.data;
    const out: AnthropicProviderConfig = {
      apiKey: o.apiKey?.trim() || undefined,
      baseURL: o.baseURL?.trim() || undefined,
    };
    if (!out.apiKey && !out.baseURL) {
      return undefined;
    }
    return out as Record<string, unknown>;
  }

  private languageModel(
    options: Record<string, unknown>,
    model: string,
  ): LanguageModelV3 {
    const modelId = model.trim();
    const a = options as Partial<AnthropicProviderConfig>;
    const provider = createAnthropic({
      apiKey: a.apiKey?.trim() || undefined,
      baseURL: a.baseURL?.trim() || undefined,
    });
    return provider(modelId);
  }

  create(
    options: Record<string, unknown>,
    model: string,
  ): ReturnType<ILlmProvider["create"]> {
    return aisdk(this.languageModel(options, model));
  }
}
