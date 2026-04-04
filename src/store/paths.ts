import { homedir } from "node:os";
import { join } from "node:path";
import {
  AGENT_CONFIG_BASENAME,
  AGENT_INSTRUCTIONS_BASENAME,
  AGENT_MCP_BASENAME,
  AGENT_TOOLS_BASENAME,
} from "./files.js";

function resolveHoomanRoot(): string {
  return join(homedir(), ".hoomanity");
}

export function agentsJsonlPath(): string {
  return join(resolveHoomanRoot(), "agents.jsonl");
}

export function agentDir(agentId: string): string {
  return join(resolveHoomanRoot(), "agents", agentId);
}

/**
 * Recollect filesystem sessions: `~/.hoomanity/agents/<id>/sessions/` (same agent tree as config).
 * Per-session dirs use `FilesystemStorageAdapter`: `<sessionId>/messages.jsonl`, etc.
 */
export function agentRecollectSessionsRoot(agentId: string): string {
  return join(agentDir(agentId), "sessions");
}

export function agentConfigPath(agentId: string): string {
  return join(agentDir(agentId), AGENT_CONFIG_BASENAME);
}

export function agentInstructionsPath(agentId: string): string {
  return join(agentDir(agentId), AGENT_INSTRUCTIONS_BASENAME);
}

export function agentMcpPath(agentId: string): string {
  return join(agentDir(agentId), AGENT_MCP_BASENAME);
}

export function agentToolsPath(agentId: string): string {
  return join(agentDir(agentId), AGENT_TOOLS_BASENAME);
}

/** Skills root for an agent: `~/.hoomanity/agents/<id>/skills/` (`npx skills … -a openclaw`). */
export function agentSkillsDir(agentId: string): string {
  return join(agentDir(agentId), "skills");
}
