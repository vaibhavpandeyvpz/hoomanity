/**
 * Rough context-window estimates (tokens) for UI percentage bars.
 * When unknown, callers should show "—" instead of a percent.
 */
export function estimateContextWindowTokens(modelId: string): number | null {
  const m = modelId.toLowerCase();

  if (m.includes("gpt-5") || m.includes("gpt-4.1") || m.includes("o3")) {
    return 1_000_000;
  }
  if (m.includes("gpt-4o") || m.includes("gpt-4-turbo")) {
    return 128_000;
  }
  if (m.includes("gpt-4")) {
    return 128_000;
  }
  if (m.includes("claude-opus-4") || m.includes("claude-sonnet-4")) {
    return 1_000_000;
  }
  if (
    m.includes("claude-3-5") ||
    m.includes("claude-3.5") ||
    m.includes("claude")
  ) {
    return 200_000;
  }
  if (m.includes("gemini") || m.includes("google")) {
    return 1_048_576;
  }
  if (m.includes("bedrock") && m.includes("anthropic")) {
    return 200_000;
  }
  if (
    m.includes("llama3") ||
    m.includes("llama-3") ||
    m.includes("mistral") ||
    m.includes("qwen") ||
    m.includes("phi") ||
    m.includes("codellama") ||
    m.includes("gemma")
  ) {
    return 128_000;
  }
  return null;
}
