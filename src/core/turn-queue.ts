import type { ConversationKey } from "./types";

type QueueJob<T> = {
  run: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

/** Rejected for jobs still in the per-conversation queue when a reset clears them. */
export class TurnQueueDroppedError extends Error {
  constructor(readonly conversationKey: ConversationKey) {
    super("Turn dropped: conversation was reset.");
    this.name = "TurnQueueDroppedError";
  }
}

export function isTurnQueueDroppedError(
  error: unknown,
): error is TurnQueueDroppedError {
  return error instanceof TurnQueueDroppedError;
}

export class TurnQueue {
  private readonly queues = new Map<ConversationKey, QueueJob<unknown>[]>();
  private readonly active = new Set<ConversationKey>();

  hasActive(conversationKey: ConversationKey): boolean {
    return this.active.has(conversationKey);
  }

  /**
   * Reject queued (not yet running) jobs for this conversation. Safe while a turn is in flight:
   * only jobs still waiting in the queue are removed; the running job is unchanged.
   */
  dropPending(conversationKey: ConversationKey): void {
    const jobs = this.queues.get(conversationKey);
    if (!jobs || jobs.length === 0) {
      return;
    }
    const err = new TurnQueueDroppedError(conversationKey);
    while (jobs.length > 0) {
      const job = jobs.shift();
      if (job) {
        job.reject(err);
      }
    }
    if (!this.active.has(conversationKey)) {
      this.queues.delete(conversationKey);
    }
  }

  enqueue<T>(
    conversationKey: ConversationKey,
    run: () => Promise<T>,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const jobs = this.queues.get(conversationKey) ?? [];
      const job: QueueJob<unknown> = {
        run: async () => run(),
        resolve: (value) => resolve(value as T),
        reject,
      };
      jobs.push(job);
      this.queues.set(conversationKey, jobs);
      this.drain(conversationKey).catch((error) => {
        console.error("Turn queue drain failed", error);
      });
    });
  }

  private async drain(conversationKey: ConversationKey): Promise<void> {
    if (this.active.has(conversationKey)) {
      return;
    }

    this.active.add(conversationKey);

    try {
      const jobs = this.queues.get(conversationKey);
      while (jobs && jobs.length > 0) {
        const next = jobs.shift();
        if (!next) {
          continue;
        }

        try {
          const value = await next.run();
          next.resolve(value);
        } catch (error) {
          next.reject(error);
        }
      }
    } finally {
      this.active.delete(conversationKey);
      this.queues.delete(conversationKey);
    }
  }
}
