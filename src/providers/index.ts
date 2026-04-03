import type { ModelProvider } from "./types.js";
import { AnthropicLlmProvider } from "./anthropic.js";
import { BedrockLlmProvider } from "./bedrock.js";
import { OpenAiLlmProvider } from "./openai.js";
import { OllamaLlmProvider } from "./ollama.js";
import type { ProviderWizard } from "./types.js";

const openai = new OpenAiLlmProvider();
const anthropic = new AnthropicLlmProvider();
const bedrock = new BedrockLlmProvider();
const ollama = new OllamaLlmProvider();

export function createProviderWizard(p: ModelProvider): ProviderWizard {
  switch (p) {
    case "openai":
      return openai.wizard();
    case "anthropic":
      return anthropic.wizard();
    case "bedrock":
      return bedrock.wizard();
    case "ollama":
      return ollama.wizard();
    default: {
      const _x: never = p;
      throw new Error(`Unknown provider: ${_x}`);
    }
  }
}

export { create } from "./factory.js";
export type { LlmProviderLookup } from "./factory.js";
export type {
  ILlmProvider,
  LlmProviderKey,
  ProviderWizard,
  ProviderWizardField,
} from "./types.js";
export {
  OpenAiLlmProvider,
  OpenAIProviderConfigSchema,
  type OpenAIProviderConfig,
} from "./openai.js";
export {
  AnthropicLlmProvider,
  AnthropicProviderConfigSchema,
  type AnthropicProviderConfig,
} from "./anthropic.js";
export {
  BedrockLlmProvider,
  BedrockProviderConfigSchema,
  type BedrockProviderConfig,
} from "./bedrock.js";
export {
  OllamaLlmProvider,
  OllamaProviderConfigSchema,
  type OllamaProviderConfig,
} from "./ollama.js";
