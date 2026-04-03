import type {
  AgentConfig,
  AgentConfigBase,
  ProviderConfigDrafts,
} from "../../agents/types.js";
import type { LlmProviderRegistry } from "../../providers/registry.js";

function draftForProvider(
  provider: AgentConfig["provider"],
  drafts: ProviderConfigDrafts,
): Record<string, unknown> {
  switch (provider) {
    case "openai":
      return drafts.openai;
    case "anthropic":
      return drafts.anthropic;
    case "bedrock":
      return drafts.bedrock;
    case "ollama":
      return drafts.ollama;
    default: {
      const _x: never = provider;
      throw new Error(`Unknown provider: ${_x}`);
    }
  }
}

/** Merge wizard drafts into a full {@link AgentConfig} using each provider’s `normalize`. */
export function finalizeAgentConfig(
  registry: LlmProviderRegistry,
  base: AgentConfigBase,
  drafts: ProviderConfigDrafts,
): AgentConfig {
  const impl = registry.get(base.provider);
  const rawDraft = draftForProvider(base.provider, drafts);
  const n = impl.normalize(rawDraft);
  const out: AgentConfig = { ...base };
  if (base.provider === "openai") {
    if (n) {
      out.openai = n as AgentConfig["openai"];
    } else {
      delete out.openai;
    }
  } else if (base.provider === "anthropic") {
    if (n) {
      out.anthropic = n as AgentConfig["anthropic"];
    } else {
      delete out.anthropic;
    }
  } else if (base.provider === "bedrock") {
    if (n) {
      out.bedrock = n as AgentConfig["bedrock"];
    } else {
      delete out.bedrock;
    }
  } else {
    if (n) {
      out.ollama = n as AgentConfig["ollama"];
    } else {
      delete out.ollama;
    }
  }
  return out;
}
