import type wwebjs from "whatsapp-web.js";

/** Latest inbound context for replies, metadata, and reaction targeting. */
export type WhatsAppLastContext = {
  readonly chatId: string;
  readonly messageId: string | null;
  readonly profile: { id: string; name: string };
  readonly chat: { id: string; name: string; isGroup: boolean };
  readonly sentAt?: string;
};

export function whatsAppMessageSerializedId(
  message: wwebjs.Message,
): string | null {
  const id = message.id as unknown;
  if (id && typeof id === "object" && "_serialized" in id) {
    return String((id as { _serialized: string })._serialized);
  }
  return null;
}

/** Group author in groups, otherwise the peer id (`from`). */
export function whatsAppEffectiveSenderId(message: wwebjs.Message): string {
  return typeof message.author === "string" && message.author.trim().length > 0
    ? message.author
    : message.from;
}

export function whatsAppForwardedDisplayBody(
  bodyTrimmed: string,
  forwarded: boolean,
  hasAttachments: boolean,
): string {
  if (!forwarded) {
    return bodyTrimmed;
  }
  if (bodyTrimmed.length > 0) {
    return `[Forwarded] ${bodyTrimmed}`;
  }
  if (hasAttachments) {
    return "[Forwarded]";
  }
  return bodyTrimmed;
}
