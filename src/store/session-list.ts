import { readdir, rm, stat, readFile } from "node:fs/promises";
import { join } from "node:path";
import { agentRecollectSessionsRoot } from "./paths.js";

export type SessionInfo = {
  /** Session directory name (e.g. "s_1712345678" or legacy "main"). */
  id: string;
  /** Number of message lines in messages.jsonl. */
  messageCount: number;
  /** Last modification time of messages.jsonl. */
  updatedAt: Date;
};

/**
 * Lists all persisted sessions for an agent by scanning
 * `~/.hoomanity/agents/<id>/sessions/` for subdirectories containing `messages.jsonl`.
 * Returns sessions sorted by updatedAt descending (most recent first).
 */
export async function listSessions(agentId: string): Promise<SessionInfo[]> {
  const root = agentRecollectSessionsRoot(agentId);
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch {
    return [];
  }

  const sessions: SessionInfo[] = [];

  for (const name of entries) {
    const messagesPath = join(root, name, "messages.jsonl");
    try {
      const s = await stat(messagesPath);
      if (!s.isFile()) continue;

      // Count lines for message count (rough but fast)
      const content = await readFile(messagesPath, "utf-8");
      const lineCount = content.trim() ? content.trim().split("\n").length : 0;

      sessions.push({
        id: name,
        messageCount: lineCount,
        updatedAt: s.mtime,
      });
    } catch {
      // No messages.jsonl → skip
    }
  }

  sessions.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  return sessions;
}

/** Permanently removes a session directory. */
export async function deleteSession(
  agentId: string,
  sessionId: string,
): Promise<void> {
  const sessionDir = join(agentRecollectSessionsRoot(agentId), sessionId);
  await rm(sessionDir, { recursive: true, force: true });
}
