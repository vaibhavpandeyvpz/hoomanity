type SlackBlock = {
  type?: string;
  text?: { type?: string; text?: string };
  elements?: SlackBlock[];
};

/** Extract plain text from Block Kit (recursive), matching apps/backend slack-adapter. */
export function textFromSlackBlocks(blocks: unknown): string {
  if (!Array.isArray(blocks)) return "";
  const parts: string[] = [];
  for (const block of blocks as SlackBlock[]) {
    if (block?.text?.text) parts.push(block.text.text);
    if (Array.isArray(block?.elements))
      parts.push(textFromSlackBlocks(block.elements));
  }
  return parts.filter(Boolean).join("\n");
}

/** Combine raw message text and block-derived text like the legacy backend. */
export function combineSlackMessageText(
  rawText: string,
  blocks: unknown,
): string {
  const blocksText = textFromSlackBlocks(blocks);
  return [rawText.trim(), blocksText.trim()]
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

export function toConversationKey(channelId: string): string {
  return `slack:${channelId}`;
}
