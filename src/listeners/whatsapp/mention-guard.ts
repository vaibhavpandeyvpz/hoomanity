export type WhatsAppChat = {
  isGroup?: boolean;
  constructor?: { name?: string };
};

type WhatsAppMessageWithChat = {
  getChat?: () => Promise<WhatsAppChat>;
};

export function whatsappChatNeedsMention(chat?: WhatsAppChat | null): boolean {
  if (!chat) {
    return false;
  }
  if (chat.isGroup === true) {
    return true;
  }
  const chatKind = chat.constructor?.name?.trim();
  if (!chatKind) {
    return false;
  }
  return chatKind !== "PrivateChat";
}

export async function whatsappMessageChatNeedsMention(
  message: WhatsAppMessageWithChat,
): Promise<boolean> {
  if (typeof message.getChat !== "function") {
    return false;
  }
  try {
    return whatsappChatNeedsMention(await message.getChat());
  } catch {
    return false;
  }
}

export function whatsappMessageMentionsAnyWid(
  mentionedIds: unknown,
  botWids: string[],
): boolean {
  if (botWids.length === 0) {
    return false;
  }
  if (!Array.isArray(mentionedIds)) {
    return false;
  }
  const widSet = new Set(botWids.map((w) => w.trim()).filter(Boolean));
  for (const id of mentionedIds) {
    if (typeof id === "string" && widSet.has(id.trim())) {
      return true;
    }
  }
  return false;
}
