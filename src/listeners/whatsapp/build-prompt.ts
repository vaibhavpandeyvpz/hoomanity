import type { StoredAttachment, PlatformPrompt } from "../../core/types";

export type WhatsAppWebhookMessage = {
  from?: string;
  id?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  image?: { id?: string; caption?: string; mime_type?: string };
  document?: {
    id?: string;
    caption?: string;
    filename?: string;
    mime_type?: string;
  };
  audio?: { id?: string; mime_type?: string };
  video?: { id?: string; caption?: string; mime_type?: string };
  interactive?: {
    type?: string;
    button_reply?: { id?: string; title?: string };
  };
};

export type WhatsAppInteractiveApproval = {
  requestId: string;
  optionId?: string;
  action: "select" | "cancel";
};

export function toWhatsAppConversationKey(chatId: string): string {
  return `whatsapp:${chatId}`;
}

export function parseInteractiveApprovalCallback(
  message: WhatsAppWebhookMessage,
): WhatsAppInteractiveApproval | undefined {
  const replyId = message.interactive?.button_reply?.id;
  if (!replyId) return undefined;
  try {
    const decoded = JSON.parse(replyId) as {
      requestId?: string;
      optionId?: string;
      action?: string;
    };
    if (!decoded.requestId) return undefined;
    if (decoded.action === "cancel") {
      return { requestId: decoded.requestId, action: "cancel" };
    }
    return {
      requestId: decoded.requestId,
      optionId: decoded.optionId,
      action: "select",
    };
  } catch {
    return undefined;
  }
}

export function extractWhatsAppText(message: WhatsAppWebhookMessage): string {
  if (message.text?.body?.trim()) return message.text.body.trim();
  if (message.image?.caption?.trim()) return message.image.caption.trim();
  if (message.document?.caption?.trim()) return message.document.caption.trim();
  if (message.video?.caption?.trim()) return message.video.caption.trim();
  return "";
}

export function mediaRefsFromWebhook(
  message: WhatsAppWebhookMessage,
): Array<{ mediaId: string; mimeType: string; originalName: string }> {
  const out: Array<{
    mediaId: string;
    mimeType: string;
    originalName: string;
  }> = [];
  if (message.image?.id) {
    out.push({
      mediaId: message.image.id,
      mimeType: message.image.mime_type ?? "image/jpeg",
      originalName: `image-${message.id ?? Date.now()}.jpg`,
    });
  }
  if (message.document?.id) {
    out.push({
      mediaId: message.document.id,
      mimeType: message.document.mime_type ?? "application/octet-stream",
      originalName:
        message.document.filename ?? `document-${message.id ?? Date.now()}`,
    });
  }
  if (message.video?.id) {
    out.push({
      mediaId: message.video.id,
      mimeType: message.video.mime_type ?? "video/mp4",
      originalName: `video-${message.id ?? Date.now()}.mp4`,
    });
  }
  if (message.audio?.id) {
    out.push({
      mediaId: message.audio.id,
      mimeType: message.audio.mime_type ?? "audio/ogg",
      originalName: `audio-${message.id ?? Date.now()}.ogg`,
    });
  }
  return out;
}

export function buildWhatsAppPlatformPrompt(
  message: WhatsAppWebhookMessage,
  attachments: StoredAttachment[],
): PlatformPrompt | undefined {
  const chatId = message.from?.trim();
  if (!chatId) return undefined;
  const text = extractWhatsAppText(message);
  if (!text && attachments.length === 0) return undefined;

  return {
    platform: "whatsapp",
    conversationKey: toWhatsAppConversationKey(chatId),
    text: text || "User sent media.",
    metadata: {
      source: "whatsapp_cloud_api",
      channelMeta: {
        channel: "whatsapp",
        message: {
          id: message.id,
          chat: { id: chatId },
          sender: { id: chatId, name: chatId },
          text: text || "",
          type: message.type,
        },
      },
      rawEvent: message,
    },
    replyTarget: {
      platform: "whatsapp",
      channelId: chatId,
    },
    receivedAt: Date.now(),
    attachments: attachments.length > 0 ? attachments : undefined,
  };
}
