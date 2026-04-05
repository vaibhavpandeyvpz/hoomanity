import { mergeAttachmentListsFromBatch } from "./attachment-utils.js";
import { mergeWhatsAppMentionsFromBatch } from "./mentions.js";
import {
  isSlackChannelMessage,
  isWhatsAppChannelMessage,
  type ChannelMessage,
} from "./types.js";

/**
 * Merge a debounced batch: concatenate `text` with blank lines; keep routing/metadata from the
 * **last** message (channel `lastContext` already matches the latest inbound event).
 */
export function mergeChannelMessageBatch(
  batch: ChannelMessage[],
): ChannelMessage {
  if (batch.length === 0) {
    throw new Error("mergeChannelMessageBatch: empty batch");
  }
  if (batch.length === 1) {
    return batch[0]!;
  }
  const last = batch[batch.length - 1]!;
  const kind = last.channel;
  if (batch.some((m) => m.channel !== kind)) {
    throw new Error(
      "mergeChannelMessageBatch: debounce key mixed channel kinds",
    );
  }
  const texts = batch
    .map((m) => m.text?.trim())
    .filter((t): t is string => Boolean(t?.length));
  const combined = texts.join("\n\n");

  const attachments = mergeAttachmentListsFromBatch(batch);
  const attProp =
    attachments.length > 0 ? ({ attachments } as const) : ({} as const);

  if (isSlackChannelMessage(last)) {
    return { ...last, text: combined, ...attProp };
  }

  if (!isWhatsAppChannelMessage(last)) {
    throw new Error(
      "mergeChannelMessageBatch: expected slack or whatsapp after homogeneity check",
    );
  }

  const { mentions, groupMentions } = mergeWhatsAppMentionsFromBatch(batch);
  const mentionProp = mentions ? ({ mentions } as const) : {};
  const groupMentionProp = groupMentions ? ({ groupMentions } as const) : {};

  return {
    ...last,
    text: combined,
    ...attProp,
    ...mentionProp,
    ...groupMentionProp,
  };
}
