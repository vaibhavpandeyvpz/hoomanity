import type { LanguageModelV3 } from "@ai-sdk/provider";
import { createOllama } from "ai-sdk-ollama";
import { aisdk } from "@openai/agents-extensions/ai-sdk";
import { z } from "zod";
import type { ILlmProvider, ProviderWizard } from "./types.js";

/** Options for [ai-sdk-ollama](https://github.com/jagreehal/ai-sdk-ollama) `createOllama`. */
export const OllamaProviderConfigSchema = z.object({
  baseURL: z.string().optional(),
  apiKey: z.string().optional(),
});

export type OllamaProviderConfig = z.infer<typeof OllamaProviderConfigSchema>;

export class OllamaLlmProvider implements ILlmProvider {
  readonly key = "ollama";

  wizard(): ProviderWizard {
    return {
      displayLabel: "Ollama (local)",
      defaultModelId: "gemma4:e4b",
      fields: [
        {
          key: "baseURL",
          label: "Ollama base URL",
          required: false,
          hint: "Leave empty for http://127.0.0.1:11434 (ollama serve)",
        },
        {
          key: "apiKey",
          label: "Ollama API key",
          required: false,
          hint: "Optional. Ollama Cloud / Bearer auth; env OLLAMA_API_KEY if empty",
          mask: "*",
        },
      ],
    };
  }

  schema() {
    return OllamaProviderConfigSchema;
  }

  normalize(raw: unknown): Record<string, unknown> | undefined {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      return undefined;
    }
    const parsed = OllamaProviderConfigSchema.safeParse(raw);
    if (!parsed.success) {
      return undefined;
    }
    const o = parsed.data;
    const out: OllamaProviderConfig = {
      baseURL: o.baseURL?.trim() || undefined,
      apiKey: o.apiKey?.trim() || undefined,
    };
    if (!out.baseURL && !out.apiKey) {
      return undefined;
    }
    return out as Record<string, unknown>;
  }

  private languageModel(
    options: Record<string, unknown>,
    model: string,
  ): LanguageModelV3 {
    const modelId = model.trim();
    const reasoningEnabled = options.reasoningEnabled;
    const o = { ...options } as Record<string, unknown> &
      Partial<OllamaProviderConfig>;
    delete o.reasoningEnabled;
    const provider = createOllama({
      baseURL: o.baseURL?.trim() || undefined,
      apiKey: o.apiKey?.trim() || undefined,
    });
    const useThink = reasoningEnabled !== false;
    return provider(modelId, useThink ? { think: true } : {});
  }

  create(
    options: Record<string, unknown>,
    model: string,
  ): ReturnType<ILlmProvider["create"]> {
    return aisdk(this.languageModel(options, model));
  }
}
