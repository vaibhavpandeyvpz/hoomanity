import type { TelegramInboundMessage } from "./build-prompt";

export function telegramChatIsPrivate(
  message: TelegramInboundMessage,
): boolean {
  return message.chat?.type === "private";
}

function utf16Slice(text: string, offset: number, length: number): string {
  return text.substring(offset, offset + length);
}

/**
 * Detects whether the user visibly @-mentioned the bot (entity-based where possible).
 */
export function telegramMessageMentionsBot(
  message: TelegramInboundMessage,
  botId: number,
  botUsername?: string,
): boolean {
  const normalizedUsername = botUsername?.replace(/^@/, "").trim();
  const scanField = (
    fieldText: string | undefined,
    entities: TelegramInboundMessage["entities"] | undefined,
  ): boolean => {
    if (!fieldText) {
      return false;
    }
    if (normalizedUsername) {
      const needle = `@${normalizedUsername}`.toLowerCase();
      if (fieldText.toLowerCase().includes(needle)) {
        return true;
      }
    }
    if (!entities || entities.length === 0) {
      return false;
    }
    for (const e of entities) {
      if (e.type === "text_mention" && e.user?.id === botId) {
        return true;
      }
      if (
        e.type === "mention" &&
        typeof e.offset === "number" &&
        typeof e.length === "number" &&
        normalizedUsername
      ) {
        const slice = utf16Slice(fieldText, e.offset, e.length);
        if (slice.toLowerCase() === `@${normalizedUsername.toLowerCase()}`) {
          return true;
        }
      }
    }
    return false;
  };

  return (
    scanField(message.text, message.entities) ||
    scanField(message.caption, message.caption_entities)
  );
}
