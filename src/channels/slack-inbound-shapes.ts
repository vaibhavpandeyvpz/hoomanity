import type { SlackEventMiddlewareArgs } from "@slack/bolt";
import type { ConversationsRepliesResponse } from "@slack/web-api";

/** Bolt `message` event payload (all message subtypes). */
export type SlackBoltInboundMessage =
  SlackEventMiddlewareArgs<"message">["message"];

/** First message in a thread from `conversations.replies`. */
export type SlackThreadApiMessage = NonNullable<
  ConversationsRepliesResponse["messages"]
>[number];

/** File row on a Slack message (Bolt event or Web API). */
export type SlackMessageFileRow = NonNullable<
  NonNullable<SlackThreadApiMessage["files"]>[number]
>;

/** Latest inbound context for replies, reactions, and `getMetadata`. */
export type SlackLastContext = {
  readonly channelId: string;
  readonly threadTs?: string;
  readonly userId?: string;
  readonly profile?: { id: string; name: string };
  readonly ts?: string;
  readonly sentAt?: string;
};

export function inboundMessageFiles(
  m: SlackBoltInboundMessage,
): SlackMessageFileRow[] {
  if (!("files" in m) || !Array.isArray(m.files)) {
    return [];
  }
  return m.files as SlackMessageFileRow[];
}

/** Skip bot posts and app messages we should not treat as user turns. */
export function isIgnoredSlackInboundMessage(
  m: SlackBoltInboundMessage,
): boolean {
  return (
    ("subtype" in m && m.subtype === "bot_message") ||
    ("bot_id" in m && Boolean(m.bot_id))
  );
}

/**
 * Extract fields common to user-originated chat messages; avoids accessing props that do not exist
 * on every {@link SlackBoltInboundMessage} union member (e.g. `message_changed`).
 */
export function slackInboundUserMessageShape(m: SlackBoltInboundMessage): {
  text: string;
  user: string;
  channelId: string;
  ts: string;
  threadTsRaw: string | undefined;
} | null {
  if (typeof m !== "object" || m === null || m.type !== "message") {
    return null;
  }
  const channelId =
    "channel" in m && typeof m.channel === "string" ? m.channel : "";
  const ts = "ts" in m && typeof m.ts === "string" ? m.ts : "";
  if (!channelId || !ts) {
    return null;
  }
  const text = "text" in m && typeof m.text === "string" ? m.text : "";
  const user = "user" in m && typeof m.user === "string" ? m.user : "";
  const threadTsRaw =
    "thread_ts" in m &&
    typeof m.thread_ts === "string" &&
    m.thread_ts.trim().length > 0
      ? m.thread_ts
      : undefined;
  return { text, user, channelId, ts, threadTsRaw };
}

/** `data.error` from Slack Web API / Bolt client errors (e.g. `already_reacted`). */
export function slackWebApiErrorCode(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null || !("data" in err)) {
    return undefined;
  }
  const data = (err as { data?: unknown }).data;
  if (typeof data !== "object" || data === null || !("error" in data)) {
    return undefined;
  }
  const code = (data as { error?: unknown }).error;
  return typeof code === "string" ? code : undefined;
}
