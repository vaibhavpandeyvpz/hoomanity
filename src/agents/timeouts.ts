import type { AgentConfig } from "./types.js";

/** Milliseconds — used at runtime and stored in `AgentConfig.timeouts`. */
export const DEFAULT_AGENT_TIMEOUTS = {
  /** Wall-clock limit for one user message run (model + tool loop). */
  turnTimeoutMs: 15 * 60 * 1000,
  /** Per MCP-backed function tool invocation. */
  toolCallTimeoutMs: 5 * 60 * 1000,
  /** MCP `connectMcpServers` connect phase. */
  mcpConnectTimeoutMs: 60 * 1000,
} as const;

export type ResolvedAgentTimeouts = {
  readonly turnTimeoutMs: number;
  readonly toolCallTimeoutMs: number;
  readonly mcpConnectTimeoutMs: number;
};

export function resolvedAgentTimeouts(
  config: AgentConfig,
): ResolvedAgentTimeouts {
  const t = config.timeouts;
  return {
    turnTimeoutMs: t?.turnTimeoutMs ?? DEFAULT_AGENT_TIMEOUTS.turnTimeoutMs,
    toolCallTimeoutMs:
      t?.toolCallTimeoutMs ?? DEFAULT_AGENT_TIMEOUTS.toolCallTimeoutMs,
    mcpConnectTimeoutMs:
      t?.mcpConnectTimeoutMs ?? DEFAULT_AGENT_TIMEOUTS.mcpConnectTimeoutMs,
  };
}

/** SDK `run(..., { maxTurns })` per user message. */
export const DEFAULT_MAX_TURNS = 100;

export function resolvedMaxTurns(config: AgentConfig): number {
  return config.maxTurns ?? DEFAULT_MAX_TURNS;
}

/** Used for session footer context meter; configurable per agent in Run limits. */
export const DEFAULT_MAX_CONTEXT_TOKENS = 50_000;

export function resolvedMaxContextTokens(config: AgentConfig): number {
  return config.maxContextTokens ?? DEFAULT_MAX_CONTEXT_TOKENS;
}
