import type {
  ConversationKey,
  PersistedSessionRecord,
  PlatformReplyTarget,
  SessionStore,
} from "../contracts";

export type SessionBinding = {
  conversationKey: ConversationKey;
  sessionId: string;
  /** Working directory used when the ACP session was created or loaded. */
  cwd: string;
  replyTarget: PlatformReplyTarget;
  updatedAt: number;
};

export class SessionRegistry {
  private readonly byConversation = new Map<ConversationKey, SessionBinding>();
  private readonly conversationBySession = new Map<string, ConversationKey>();
  /** Restored from disk before any live message (no reply target yet). */
  private readonly persistedOnly = new Map<
    ConversationKey,
    PersistedSessionRecord
  >();

  constructor(private readonly store?: SessionStore) {}

  /**
   * Load persisted session ids from disk into memory (no reply targets).
   * Call once at startup after constructing the registry.
   */
  async hydrateFromDisk(): Promise<void> {
    if (!this.store) {
      return;
    }
    const all = await this.store.readAll();
    for (const [key, rec] of all) {
      if (!this.byConversation.has(key)) {
        this.persistedOnly.set(key, rec);
      }
    }
  }

  getByConversation(
    conversationKey: ConversationKey,
  ): SessionBinding | undefined {
    return this.byConversation.get(conversationKey);
  }

  /** Session id from a prior run, if any, when there is no in-memory binding yet. */
  getPersisted(
    conversationKey: ConversationKey,
  ): PersistedSessionRecord | undefined {
    const mem = this.byConversation.get(conversationKey);
    if (mem) {
      return {
        sessionId: mem.sessionId,
        cwd: mem.cwd,
        updatedAt: mem.updatedAt,
      };
    }
    return this.persistedOnly.get(conversationKey);
  }

  getBySessionId(sessionId: string): SessionBinding | undefined {
    const conversationKey = this.conversationBySession.get(sessionId);
    if (!conversationKey) {
      return undefined;
    }

    return this.byConversation.get(conversationKey);
  }

  upsert(
    conversationKey: ConversationKey,
    sessionId: string,
    cwd: string,
    replyTarget: PlatformReplyTarget,
  ): SessionBinding {
    const next: SessionBinding = {
      conversationKey,
      sessionId,
      cwd,
      replyTarget,
      updatedAt: Date.now(),
    };

    const existing = this.byConversation.get(conversationKey);
    if (existing && existing.sessionId !== sessionId) {
      this.conversationBySession.delete(existing.sessionId);
    }

    this.byConversation.set(conversationKey, next);
    this.conversationBySession.set(sessionId, conversationKey);
    this.persistedOnly.delete(conversationKey);

    void this.persistToDisk(conversationKey, next);

    return next;
  }

  private async persistToDisk(
    conversationKey: ConversationKey,
    binding: SessionBinding,
  ): Promise<void> {
    if (!this.store) {
      return;
    }
    try {
      await this.store.upsert(conversationKey, {
        sessionId: binding.sessionId,
        cwd: binding.cwd,
        updatedAt: binding.updatedAt,
      });
    } catch {
      // best-effort persistence
    }
  }
}
