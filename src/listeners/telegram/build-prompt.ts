import type { PlatformPrompt, StoredAttachment } from "../../contracts";

export type TelegramFileEntity = {
  file_id?: string;
  file_name?: string;
  mime_type?: string;
};

export type TelegramPhotoSize = {
  file_id?: string;
};

export type TelegramMessageEntity = {
  type?: string;
  offset?: number;
  length?: number;
  user?: { id?: number; is_bot?: boolean; username?: string };
};

export type TelegramInboundMessage = {
  message_id?: number;
  text?: string;
  caption?: string;
  entities?: TelegramMessageEntity[];
  caption_entities?: TelegramMessageEntity[];
  date?: number;
  message_thread_id?: number;
  chat?: {
    id?: number | string;
    type?: string;
    title?: string;
    username?: string;
    first_name?: string;
    last_name?: string;
  };
  from?: {
    id?: number;
    is_bot?: boolean;
    username?: string;
    first_name?: string;
    last_name?: string;
  };
  photo?: TelegramPhotoSize[];
  document?: TelegramFileEntity;
  video?: TelegramFileEntity;
  audio?: TelegramFileEntity;
  voice?: TelegramFileEntity;
  animation?: TelegramFileEntity;
};

export type TelegramApprovalAction = {
  requestId: string;
  optionIndex?: number;
  action: "select" | "cancel";
};

export function toTelegramConversationKey(chatId: string): string {
  return `telegram:${chatId}`;
}

export function parseTelegramApprovalCallback(
  data: string | undefined,
): TelegramApprovalAction | undefined {
  const value = data?.trim();
  if (!value) {
    return undefined;
  }
  const parts = value.split(":");
  if (parts.length !== 3 || parts[0] !== "ap") {
    return undefined;
  }
  const [, requestId, rawAction] = parts;
  if (!requestId) {
    return undefined;
  }
  if (rawAction === "c") {
    return { requestId, action: "cancel" };
  }
  const optionIndex = Number(rawAction);
  if (!Number.isInteger(optionIndex) || optionIndex < 0) {
    return undefined;
  }
  return {
    requestId,
    optionIndex,
    action: "select",
  };
}

export function telegramApprovalCallbackData(
  requestId: string,
  action: "cancel" | number,
): string {
  return `ap:${requestId}:${action === "cancel" ? "c" : action}`;
}

export function extractTelegramText(message: TelegramInboundMessage): string {
  if (message.text?.trim()) {
    return message.text.trim();
  }
  if (message.caption?.trim()) {
    return message.caption.trim();
  }
  return "";
}

export function mediaRefsFromTelegramMessage(
  message: TelegramInboundMessage,
): Array<{ fileId: string; mimeType: string; originalName: string }> {
  const out: Array<{ fileId: string; mimeType: string; originalName: string }> =
    [];
  const messageId = String(message.message_id ?? Date.now());
  const largestPhoto = Array.isArray(message.photo)
    ? message.photo[message.photo.length - 1]
    : undefined;
  if (largestPhoto?.file_id) {
    out.push({
      fileId: largestPhoto.file_id,
      mimeType: "image/jpeg",
      originalName: `photo-${messageId}.jpg`,
    });
  }
  if (message.document?.file_id) {
    out.push({
      fileId: message.document.file_id,
      mimeType: message.document.mime_type ?? "application/octet-stream",
      originalName: message.document.file_name ?? `document-${messageId}`,
    });
  }
  if (message.video?.file_id) {
    out.push({
      fileId: message.video.file_id,
      mimeType: message.video.mime_type ?? "video/mp4",
      originalName: message.video.file_name ?? `video-${messageId}.mp4`,
    });
  }
  if (message.audio?.file_id) {
    out.push({
      fileId: message.audio.file_id,
      mimeType: message.audio.mime_type ?? "audio/mpeg",
      originalName: message.audio.file_name ?? `audio-${messageId}.mp3`,
    });
  }
  if (message.voice?.file_id) {
    out.push({
      fileId: message.voice.file_id,
      mimeType: message.voice.mime_type ?? "audio/ogg",
      originalName: `voice-${messageId}.ogg`,
    });
  }
  if (message.animation?.file_id) {
    out.push({
      fileId: message.animation.file_id,
      mimeType: message.animation.mime_type ?? "video/mp4",
      originalName: message.animation.file_name ?? `animation-${messageId}.mp4`,
    });
  }
  return out;
}

export function buildTelegramPlatformPrompt(
  message: TelegramInboundMessage,
  attachments: StoredAttachment[],
  botIdentity?: { id: number; username?: string },
): PlatformPrompt | undefined {
  const chatId = normalizeChatId(message.chat?.id);
  if (!chatId) {
    return undefined;
  }
  const text = extractTelegramText(message);
  if (!text && attachments.length === 0) {
    return undefined;
  }
  const chatName =
    message.chat?.title?.trim() ||
    message.chat?.username?.trim() ||
    [message.chat?.first_name, message.chat?.last_name]
      .filter((part): part is string => Boolean(part?.trim()))
      .join(" ")
      .trim() ||
    chatId;
  const senderName =
    [message.from?.first_name, message.from?.last_name]
      .filter((part): part is string => Boolean(part?.trim()))
      .join(" ")
      .trim() ||
    message.from?.username?.trim() ||
    String(message.from?.id ?? chatId);

  return {
    platform: "telegram",
    conversationKey: toTelegramConversationKey(chatId),
    text: text || "User sent media.",
    metadata: {
      source: "telegram_polling",
      channelMeta: {
        channel: "telegram",
        self: {
          id: botIdentity?.id ?? null,
          username: botIdentity?.username ?? null,
        },
        message: {
          id: message.message_id,
          chat: {
            id: chatId,
            name: chatName,
            type: message.chat?.type ?? "private",
            threadId: message.message_thread_id ?? null,
          },
          sender: {
            id: String(message.from?.id ?? chatId),
            name: senderName,
            username: message.from?.username ?? null,
          },
          text,
        },
      },
      rawEvent: message,
    },
    replyTarget: {
      platform: "telegram",
      channelId: chatId,
      threadTs:
        typeof message.message_thread_id === "number"
          ? String(message.message_thread_id)
          : undefined,
    },
    receivedAt: Date.now(),
    attachments: attachments.length > 0 ? attachments : undefined,
  };
}

function normalizeChatId(
  chatId: number | string | undefined,
): string | undefined {
  if (chatId == null) {
    return undefined;
  }
  const value = String(chatId).trim();
  return value || undefined;
}
