import type { LanguageModelV3 } from "@ai-sdk/provider";
import { createOpenAI } from "@ai-sdk/openai";
import { aisdk } from "@openai/agents-extensions/ai-sdk";
import { z } from "zod";
import type { ILlmProvider, ProviderWizard } from "./types.js";

/** OpenAI provider options (AI SDK createOpenAI). Empty strings are normalized away when saving. */
export const OpenAIProviderConfigSchema = z.object({
  apiKey: z.string().optional(),
  organization: z.string().optional(),
  project: z.string().optional(),
  baseURL: z.string().optional(),
});

export type OpenAIProviderConfig = z.infer<typeof OpenAIProviderConfigSchema>;

export class OpenAiLlmProvider implements ILlmProvider {
  readonly key = "openai";

  wizard(): ProviderWizard {
    return {
      displayLabel: "OpenAI",
      defaultModelId: "gpt-5.4",
      fields: [
        {
          key: "apiKey",
          label: "OpenAI API key",
          required: true,
          hint: "Leave empty to use OPENAI_API_KEY from the environment",
          mask: "*",
        },
        {
          key: "organization",
          label: "Organization ID",
          required: false,
          hint: "Optional. OpenAI org id; env OPENAI_ORG_ID if empty",
        },
        {
          key: "project",
          label: "Project ID",
          required: false,
          hint: "Optional. OpenAI project id from the dashboard",
        },
        {
          key: "baseURL",
          label: "API base URL",
          required: false,
          hint: "Optional. Custom gateway, Azure OpenAI-style host, or compatible API base URL",
        },
      ],
    };
  }

  schema() {
    return OpenAIProviderConfigSchema;
  }

  normalize(raw: unknown): Record<string, unknown> | undefined {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      return undefined;
    }
    const parsed = OpenAIProviderConfigSchema.safeParse(raw);
    if (!parsed.success) {
      return undefined;
    }
    const o = parsed.data;
    const out: OpenAIProviderConfig = {
      apiKey: o.apiKey?.trim() || undefined,
      organization: o.organization?.trim() || undefined,
      project: o.project?.trim() || undefined,
      baseURL: o.baseURL?.trim() || undefined,
    };
    if (!out.apiKey && !out.organization && !out.project && !out.baseURL) {
      return undefined;
    }
    return out as Record<string, unknown>;
  }

  private languageModel(
    options: Record<string, unknown>,
    model: string,
  ): LanguageModelV3 {
    const modelId = model.trim();
    const o = options as Partial<OpenAIProviderConfig>;
    const provider = createOpenAI({
      apiKey: o.apiKey?.trim() || undefined,
      organization: o.organization?.trim() || undefined,
      project: o.project?.trim() || undefined,
      baseURL: o.baseURL?.trim() || undefined,
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
