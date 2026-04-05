/**
 * Structured inbound payloads from bot adapters (Slack / WhatsApp). The runner stringifies
 * metadata as `### Channel message context` (see reference `channelMeta`).
 */

export type Message = {
  text?: string;
};

/** Saved inbound file on disk (session attachments dir). */
export type ChannelAttachmentRef = {
  readonly id: string;
  readonly path: string;
  readonly mimeType: string;
  readonly originalName: string;
};

export type SlackParentMessage = {
  readonly messageTs: string;
  readonly text?: string;
  readonly userId?: string;
  readonly userName?: string;
  readonly attachments?: readonly ChannelAttachmentRef[];
  /** Slack Block Kit elements from the parent message, when present. */
  readonly blocks?: unknown;
  /** User ids (`U…`) gathered from `<@U…>` in text and from block payloads. */
  readonly mentions?: readonly string[];
};

export type SlackMessage = Message & {
  readonly channel: "slack";
  readonly channelId: string;
  readonly messageTs: string;
  readonly threadTs?: string;
  readonly userId?: string;
  readonly userName?: string;
  /** When the user sent the message (server local timezone). */
  readonly sentAt?: string;
  readonly attachments?: readonly ChannelAttachmentRef[];
  readonly parent?: SlackParentMessage;
};

/** Group @-mention segment from WhatsApp (`whatsapp-web.js` `groupMentions`). */
export type WhatsAppGroupMentionRef = {
  readonly groupSubject: string;
  readonly groupJid: string;
};

export type WhatsAppParentMessage = {
  readonly messageId?: string;
  readonly senderId?: string;
  readonly text?: string;
  readonly attachments?: readonly ChannelAttachmentRef[];
  /** Contact / user JIDs from `mentionedIds` on the quoted message. */
  readonly mentions?: readonly string[];
  readonly groupMentions?: readonly WhatsAppGroupMentionRef[];
};

export type WhatsAppMessage = Message & {
  readonly channel: "whatsapp";
  readonly chatId: string;
  readonly messageId?: string;
  /** Who sent the message (`author` in groups, otherwise the peer id). */
  readonly senderId: string;
  /** Sender display name (contact pushname / name). */
  readonly senderName?: string;
  /** WhatsApp chat or group title (`chat.name`). */
  readonly threadName?: string;
  readonly isGroup?: boolean;
  /** When the user sent the message (server local timezone). */
  readonly sentAt?: string;
  readonly forwarded?: boolean;
  readonly attachments?: readonly ChannelAttachmentRef[];
  /** Contact / user JIDs from `mentionedIds` on this message (groups, etc.). */
  readonly mentions?: readonly string[];
  readonly groupMentions?: readonly WhatsAppGroupMentionRef[];
  readonly parent?: WhatsAppParentMessage;
};

/** Structured inbound message passed from Slack/WhatsApp adapters to the runner. */
export type ChannelMessage = SlackMessage | WhatsAppMessage;

export function isSlackChannelMessage(m: ChannelMessage): m is SlackMessage {
  return m.channel === "slack";
}

export function isWhatsAppChannelMessage(
  m: ChannelMessage,
): m is WhatsAppMessage {
  return m.channel === "whatsapp";
}

export function isStructuredChannelMessage(
  p: string | ChannelMessage,
): p is ChannelMessage {
  return typeof p === "object" && p !== null && "channel" in p;
}
