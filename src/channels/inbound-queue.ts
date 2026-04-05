import { log } from "../logging/app-logger.js";
import type { ChannelMessage } from "./types.js";
import { mergeChannelMessageBatch } from "./merge-inbound-batch.js";

export { mergeChannelMessageBatch } from "./merge-inbound-batch.js";

/** Default debounce windows (ms) — same order of magnitude as reference backend env defaults. */
export const DEFAULT_DEBOUNCE_MS_SLACK = 650;
export const DEFAULT_DEBOUNCE_MS_WHATSAPP = 800;

/**
 * Slack channel id or WhatsApp chat id (trimmed), for logs and UI. Not the same as
 * {@link debounceKeyForMessage} (which includes Slack thread granularity).
 */
export function channelConversationId(msg: ChannelMessage): string | undefined {
  switch (msg.channel) {
    case "slack": {
      const id = msg.channelId?.trim();
      return id || undefined;
    }
    case "whatsapp": {
      const id = msg.chatId?.trim();
      return id || undefined;
    }
    default: {
      const _exhaustive: never = msg;
      return _exhaustive;
    }
  }
}

/**
 * Stable key per conversation so rapid messages merge and share one debounce timer
 * (see reference `computeDebounceKey` in enqueue.ts).
 */
export function debounceKeyForMessage(msg: ChannelMessage): string {
  switch (msg.channel) {
    case "slack": {
      const thread = msg.threadTs?.trim() || msg.messageTs || "root";
      return `slack:${msg.channelId}:${thread}`;
    }
    case "whatsapp":
      return `whatsapp:${msg.chatId}`;
    default: {
      const _exhaustive: never = msg;
      return _exhaustive;
    }
  }
}

export function debounceMsForMessage(msg: ChannelMessage): number {
  switch (msg.channel) {
    case "slack":
      return DEFAULT_DEBOUNCE_MS_SLACK;
    case "whatsapp":
      return DEFAULT_DEBOUNCE_MS_WHATSAPP;
    default: {
      const _exhaustive: never = msg;
      return _exhaustive;
    }
  }
}

type KeyState = {
  timer: ReturnType<typeof setTimeout> | null;
  batch: ChannelMessage[];
};

export type DebouncedSerialInboundQueue = {
  /**
   * Debounce by {@link debounceKeyForMessage}; each flush schedules one turn on a global
   * serial chain so only one runner executes at a time per queue instance.
   */
  schedule(
    msg: ChannelMessage,
    run: (merged: ChannelMessage) => Promise<void>,
    debounceMs?: number,
  ): void;
  dispose(): void;
};

export function createDebouncedSerialInboundQueue(): DebouncedSerialInboundQueue {
  const byKey = new Map<string, KeyState>();
  let serial: Promise<unknown> = Promise.resolve();

  return {
    schedule(msg, run, debounceMs) {
      const key = debounceKeyForMessage(msg);
      const ms = debounceMs ?? debounceMsForMessage(msg);

      let st = byKey.get(key);
      if (!st) {
        st = { timer: null, batch: [] };
        byKey.set(key, st);
      }
      st.batch.push(msg);
      if (st.timer) {
        clearTimeout(st.timer);
      }
      st.timer = setTimeout(() => {
        st!.timer = null;
        byKey.delete(key);
        const batch = st!.batch;
        st!.batch = [];
        if (batch.length === 0) {
          return;
        }
        const merged = mergeChannelMessageBatch(batch);
        serial = serial
          .catch(() => {})
          .then(() => run(merged))
          .catch((err) => {
            log.error("[DebouncedSerialInboundQueue] turn failed:", err);
          });
      }, ms);
    },
    dispose() {
      for (const st of byKey.values()) {
        if (st.timer) {
          clearTimeout(st.timer);
        }
      }
      byKey.clear();
    },
  };
}
