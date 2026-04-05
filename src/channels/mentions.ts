/**
 * Mention extraction for Slack (thread parent) and WhatsApp (message / quoted parent).
 */

import type wwebjs from "whatsapp-web.js";
import type { ChannelMessage, WhatsAppGroupMentionRef } from "./types.js";

// --- Slack (thread parent) ---

function isLikelySlackUserId(s: unknown): s is string {
  return typeof s === "string" && /^U[A-Z0-9]+$/.test(s);
}

export function slackUserIdsFromMessageText(text: string): string[] {
  const ids: string[] = [];
  for (const m of text.matchAll(/<@(U[A-Z0-9]+)>/g)) {
    ids.push(m[1]!);
  }
  return [...new Set(ids)];
}

/**
 * Walks arbitrary JSON-like block trees and collects `user_id` / `user` values that look like
 * Slack user ids (rich_text, section accessories, etc.).
 */
export function slackUserIdsFromBlocks(blocks: unknown): string[] {
  const ids = new Set<string>();

  const visit = (node: unknown): void => {
    if (node === null || node === undefined) {
      return;
    }
    if (Array.isArray(node)) {
      for (const x of node) {
        visit(x);
      }
      return;
    }
    if (typeof node !== "object") {
      return;
    }
    const o = node as Record<string, unknown>;
    for (const [k, v] of Object.entries(o)) {
      if ((k === "user_id" || k === "user") && isLikelySlackUserId(v)) {
        ids.add(v);
      }
      visit(v);
    }
  };

  visit(blocks);
  return [...ids];
}

export function slackParentMentions(
  text: string | undefined,
  blocks: unknown,
): string[] {
  const fromText = text?.length ? slackUserIdsFromMessageText(text) : [];
  const fromBlocks = slackUserIdsFromBlocks(blocks);
  return [...new Set([...fromText, ...fromBlocks])];
}

// --- WhatsApp ---

export function whatsAppMentionPayload(message: wwebjs.Message): {
  mentions?: string[];
  groupMentions?: WhatsAppGroupMentionRef[];
} {
  const out: {
    mentions?: string[];
    groupMentions?: WhatsAppGroupMentionRef[];
  } = {};
  if (Array.isArray(message.mentionedIds) && message.mentionedIds.length > 0) {
    out.mentions = [...new Set(message.mentionedIds)];
  }
  if (
    Array.isArray(message.groupMentions) &&
    message.groupMentions.length > 0
  ) {
    out.groupMentions = message.groupMentions.map((g) => ({
      groupSubject: g.groupSubject,
      groupJid: g.groupJid,
    }));
  }
  return out;
}

/** Dedupe mention ids / group jids across a debounced WhatsApp batch (order preserved). */
export function mergeWhatsAppMentionsFromBatch(batch: ChannelMessage[]): {
  mentions?: readonly string[];
  groupMentions?: readonly WhatsAppGroupMentionRef[];
} {
  const seenMentionIds = new Set<string>();
  const mergedMentions: string[] = [];
  const seenGroupJids = new Set<string>();
  const mergedGroupMentions: WhatsAppGroupMentionRef[] = [];
  for (const m of batch) {
    if (m.channel !== "whatsapp") continue;
    if (m.mentions?.length) {
      for (const id of m.mentions) {
        if (seenMentionIds.has(id)) continue;
        seenMentionIds.add(id);
        mergedMentions.push(id);
      }
    }
    if (m.groupMentions?.length) {
      for (const g of m.groupMentions) {
        if (seenGroupJids.has(g.groupJid)) continue;
        seenGroupJids.add(g.groupJid);
        mergedGroupMentions.push(g);
      }
    }
  }
  return {
    ...(mergedMentions.length > 0 ? { mentions: mergedMentions } : {}),
    ...(mergedGroupMentions.length > 0
      ? { groupMentions: mergedGroupMentions }
      : {}),
  };
}
