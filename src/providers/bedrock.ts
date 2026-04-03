import type { LanguageModelV3 } from "@ai-sdk/provider";
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { aisdk } from "@openai/agents-extensions/ai-sdk";
import { z } from "zod";
import type { ILlmProvider, ProviderWizard } from "./types.js";

/** Amazon Bedrock provider options (AI SDK createAmazonBedrock). */
export const BedrockProviderConfigSchema = z.object({
  region: z.string().optional(),
  apiKey: z.string().optional(),
  accessKeyId: z.string().optional(),
  secretAccessKey: z.string().optional(),
  sessionToken: z.string().optional(),
  baseURL: z.string().optional(),
});

export type BedrockProviderConfig = z.infer<typeof BedrockProviderConfigSchema>;

export class BedrockLlmProvider implements ILlmProvider {
  readonly key = "bedrock";

  wizard(): ProviderWizard {
    return {
      displayLabel: "Amazon Bedrock",
      defaultModelId: "us.anthropic.claude-3-5-sonnet-20241022-v2:0",
      fields: [
        {
          key: "region",
          label: "AWS region",
          required: true,
          hint: "e.g. us-east-1. Leave empty to use AWS_REGION from the environment",
        },
        {
          key: "apiKey",
          label: "Bedrock bearer API key",
          required: false,
          hint: "Optional. Otherwise use access key + secret (below), IAM role, or AWS_BEARER_TOKEN_BEDROCK",
          mask: "*",
        },
        {
          key: "accessKeyId",
          label: "AWS access key ID",
          required: false,
          hint: "Optional. Uses the default AWS credential provider chain when empty",
          mask: "*",
        },
        {
          key: "secretAccessKey",
          label: "AWS secret access key",
          required: false,
          hint: "Optional. Pair with access key ID for long-lived keys",
          mask: "*",
        },
        {
          key: "sessionToken",
          label: "AWS session token",
          required: false,
          hint: "Optional. Needed for temporary credentials (STS / assumed role)",
          mask: "*",
        },
        {
          key: "baseURL",
          label: "Endpoint / API base URL",
          required: false,
          hint: "Optional. Override the default regional Bedrock endpoint URL",
        },
      ],
    };
  }

  schema() {
    return BedrockProviderConfigSchema;
  }

  normalize(raw: unknown): Record<string, unknown> | undefined {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      return undefined;
    }
    const parsed = BedrockProviderConfigSchema.safeParse(raw);
    if (!parsed.success) {
      return undefined;
    }
    const o = parsed.data;
    const out: BedrockProviderConfig = {
      region: o.region?.trim() || undefined,
      apiKey: o.apiKey?.trim() || undefined,
      accessKeyId: o.accessKeyId?.trim() || undefined,
      secretAccessKey: o.secretAccessKey?.trim() || undefined,
      sessionToken: o.sessionToken?.trim() || undefined,
      baseURL: o.baseURL?.trim() || undefined,
    };
    if (
      !out.region &&
      !out.apiKey &&
      !out.accessKeyId &&
      !out.secretAccessKey &&
      !out.sessionToken &&
      !out.baseURL
    ) {
      return undefined;
    }
    return out as Record<string, unknown>;
  }

  private languageModel(
    options: Record<string, unknown>,
    model: string,
  ): LanguageModelV3 {
    const modelId = model.trim();
    const b = options as Partial<BedrockProviderConfig>;
    const provider = createAmazonBedrock({
      region: b.region?.trim() || undefined,
      apiKey: b.apiKey?.trim() || undefined,
      accessKeyId: b.accessKeyId?.trim() || undefined,
      secretAccessKey: b.secretAccessKey?.trim() || undefined,
      sessionToken: b.sessionToken?.trim() || undefined,
      baseURL: b.baseURL?.trim() || undefined,
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
