import type { ChannelAttachmentRef, ChannelMessage } from "./types.js";

export function dedupeAttachmentsByPath(
  refs: readonly ChannelAttachmentRef[],
): ChannelAttachmentRef[] {
  const seen = new Set<string>();
  const out: ChannelAttachmentRef[] = [];
  for (const r of refs) {
    if (seen.has(r.path)) continue;
    seen.add(r.path);
    out.push(r);
  }
  return out;
}

/** Concatenate attachment lists from a debounced batch; first occurrence of each path wins. */
export function mergeAttachmentListsFromBatch(
  batch: ChannelMessage[],
): ChannelAttachmentRef[] {
  const acc: ChannelAttachmentRef[] = [];
  for (const m of batch) {
    const att = m.attachments;
    if (!att?.length) continue;
    acc.push(...att);
  }
  return dedupeAttachmentsByPath(acc);
}

export function collectChannelMessageAttachments(
  msg: ChannelMessage,
): ChannelAttachmentRef[] {
  const acc: ChannelAttachmentRef[] = [];
  const add = (list?: readonly ChannelAttachmentRef[]) => {
    if (!list) return;
    acc.push(...list);
  };
  add(msg.attachments);
  add(msg.parent?.attachments);
  return dedupeAttachmentsByPath(acc);
}
