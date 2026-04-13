import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { ConversationKey } from "./types";

export type PersistedAcpSession = {
  sessionId: string;
  cwd: string;
  updatedAt: number;
};

type StoreFileV1 = {
  v: 1;
  sessions: Record<ConversationKey, PersistedAcpSession>;
};

export class AcpSessionStore {
  constructor(private readonly filePath: string) {}

  async readAll(): Promise<Map<ConversationKey, PersistedAcpSession>> {
    const out = new Map<ConversationKey, PersistedAcpSession>();
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as StoreFileV1;
      if (
        parsed?.v === 1 &&
        parsed.sessions &&
        typeof parsed.sessions === "object"
      ) {
        for (const [key, rec] of Object.entries(parsed.sessions)) {
          if (
            typeof rec?.sessionId === "string" &&
            typeof rec?.cwd === "string" &&
            typeof rec?.updatedAt === "number"
          ) {
            out.set(key, {
              sessionId: rec.sessionId,
              cwd: rec.cwd,
              updatedAt: rec.updatedAt,
            });
          }
        }
      }
    } catch (e: unknown) {
      const code = (e as NodeJS.ErrnoException)?.code;
      if (code !== "ENOENT") {
        throw e;
      }
    }
    return out;
  }

  async upsert(
    conversationKey: ConversationKey,
    record: PersistedAcpSession,
  ): Promise<void> {
    const current = await this.readAll();
    current.set(conversationKey, record);
    await this.writeMap(current);
  }

  private async writeMap(
    map: Map<ConversationKey, PersistedAcpSession>,
  ): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const sessions: Record<string, PersistedAcpSession> = {};
    for (const [k, v] of map) {
      sessions[k] = v;
    }
    const payload: StoreFileV1 = { v: 1, sessions };
    await writeFile(
      this.filePath,
      `${JSON.stringify(payload, null, 2)}\n`,
      "utf8",
    );
  }
}
