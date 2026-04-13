import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { homedir } from "node:os";
import type { PlatformPrompt } from "../../core/types";

type WwebjsMessage = {
  id?: { _serialized?: string };
  from?: string;
  body?: string;
  type?: string;
  hasMedia?: boolean;
  fromMe?: boolean;
  author?: string;
  timestamp?: number;
  getQuotedMessage?: () => Promise<WwebjsMessage>;
  hasQuotedMsg?: boolean;
  downloadMedia?: () => Promise<
    { data?: string; mimetype?: string; filename?: string } | undefined
  >;
};

function attachmentsRoot(): string {
  return join(homedir(), ".hooman", "attachments");
}

function sanitizeFilename(name: string): string {
  return name.replace(/[/\\]/g, "_").slice(0, 200) || "file";
}

async function saveAttachmentFromMessage(message: WwebjsMessage) {
  if (!message.hasMedia || !message.downloadMedia) return undefined;
  const media = await message.downloadMedia();
  if (!media?.data) return undefined;
  const mimeType = (media.mimetype ?? "application/octet-stream").toLowerCase();
  const originalName = sanitizeFilename(
    media.filename ?? `attachment-${Date.now()}`,
  );
  const buffer = Buffer.from(media.data, "base64");
  const root = attachmentsRoot();
  await mkdir(root, { recursive: true });
  const localPath = join(root, `${randomUUID()}-${originalName}`);
  await writeFile(localPath, buffer);
  return {
    localPath,
    originalName,
    mimeType,
  };
}

export function toWwebjsConversationKey(chatId: string): string {
  return `whatsapp:${chatId}`;
}

export async function buildWwebjsPlatformPrompt(
  message: WwebjsMessage,
): Promise<PlatformPrompt | undefined> {
  const chatId = message.from?.trim();
  if (!chatId || message.fromMe) return undefined;

  const text = (message.body ?? "").trim();
  const attachment = await saveAttachmentFromMessage(message);
  const hasContent = text.length > 0 || Boolean(attachment);
  if (!hasContent) return undefined;

  let quoted: Record<string, unknown> | undefined;
  if (message.hasQuotedMsg && message.getQuotedMessage) {
    try {
      const parent = await message.getQuotedMessage();
      quoted = {
        id: parent.id?._serialized,
        from: parent.from,
        text: parent.body ?? "",
        type: parent.type,
      };
    } catch {
      quoted = undefined;
    }
  }

  return {
    platform: "wwebjs",
    conversationKey: toWwebjsConversationKey(chatId),
    text: text || "User sent media.",
    metadata: {
      source: "whatsapp_wwebjs",
      channelMeta: {
        channel: "whatsapp",
        message: {
          id: message.id?._serialized,
          chat: { id: chatId },
          sender: {
            id: message.author ?? message.from,
            name: message.author ?? message.from,
          },
          text: text || "",
          type: message.type,
          parent: quoted ?? null,
        },
      },
    },
    replyTarget: {
      platform: "wwebjs",
      channelId: chatId,
    },
    receivedAt: Date.now(),
    attachments: attachment ? [attachment] : undefined,
  };
}
