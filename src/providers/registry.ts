import type { ModelProvider } from "./types.js";
import { AnthropicLlmProvider } from "./anthropic.js";
import { BedrockLlmProvider } from "./bedrock.js";
import { OpenAiLlmProvider } from "./openai.js";
import { OllamaLlmProvider } from "./ollama.js";
import type { ILlmProvider } from "./types.js";

/**
 * Maps persisted {@link ModelProvider} to {@link ILlmProvider} implementations.
 */
export class LlmProviderRegistry {
  private readonly byKey = new Map<ModelProvider, ILlmProvider>();

  constructor(
    seed: readonly ILlmProvider[] = [
      new OpenAiLlmProvider(),
      new AnthropicLlmProvider(),
      new BedrockLlmProvider(),
      new OllamaLlmProvider(),
    ],
  ) {
    for (const p of seed) {
      this.register(p);
    }
  }

  register(provider: ILlmProvider): void {
    this.byKey.set(provider.key as ModelProvider, provider);
  }

  get(key: ModelProvider): ILlmProvider {
    const p = this.byKey.get(key);
    if (!p) {
      throw new Error(`Unknown LLM provider key: ${key}`);
    }
    return p;
  }

  /** Stable order for CLI / Ink selection. */
  list(): readonly ILlmProvider[] {
    return [...this.byKey.values()];
  }
}
