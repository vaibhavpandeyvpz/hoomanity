import type { ConversationKey } from "./conversation";

export type PersistedSessionRecord = {
  sessionId: string;
  cwd: string;
  updatedAt: number;
};

export type SessionStore = {
  readAll: () => Promise<Map<ConversationKey, PersistedSessionRecord>>;
  upsert: (
    conversationKey: ConversationKey,
    record: PersistedSessionRecord,
  ) => Promise<void>;
};
