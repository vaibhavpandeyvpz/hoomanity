import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { WebClient } from "@slack/web-api";
import type { PlatformPrompt, PlatformReplyTarget } from "../../contracts";
import { log } from "../../core/logger";
import { attachmentsDir } from "../../paths";
import {
  combineSlackMessageText,
  textFromSlackBlocks,
  toConversationKey,
} from "./mapper";

type SlackFileInput = {
  url_private_download?: string;
  name?: string;
  mimetype?: string;
};

type SlackMessageEvent = {
  type?: string;
  text?: string;
  user?: string;
  bot_id?: string;
  subtype?: string;
  channel?: string;
  ts?: string;
  thread_ts?: string;
  blocks?: unknown;
  files?: SlackFileInput[];
};

type SlackEnvelope = {
  team_id?: string;
  event?: SlackMessageEvent;
  [key: string]: unknown;
};

function slackChannelTypeFromId(
  channelId: string,
): "dm" | "group_chat" | "public_channel" | "private_channel" {
  if (channelId.startsWith("D")) return "dm";
  if (channelId.startsWith("G")) return "group_chat";
  if (channelId.startsWith("C")) return "public_channel";
  return "private_channel";
}

function slackChannelEntity(channelId: string, displayName: string) {
  return {
    id: channelId,
    name: displayName.trim() || channelId,
    type: slackChannelTypeFromId(channelId),
  };
}

function isHtmlResponse(buf: Buffer): boolean {
  const start = buf.subarray(0, 100).toString("utf8").trimStart();
  return (
    start.startsWith("<!") ||
    start.startsWith("<?xml") ||
    start.toLowerCase().startsWith("<html")
  );
}

function sanitizeFilename(name: string): string {
  return name.replace(/[/\\]/g, "_").slice(0, 200) || "file";
}

function getAttachmentsRoot(): string {
  return attachmentsDir;
}

async function saveBufferToAttachments(
  buffer: Buffer,
  originalName: string,
  mimeType: string,
): Promise<{ localPath: string; originalName: string; mimeType: string }> {
  const root = getAttachmentsRoot();
  await mkdir(root, { recursive: true });
  const safe = sanitizeFilename(originalName);
  const storedName = `${randomUUID()}-${safe}`;
  const localPath = join(root, storedName);
  await writeFile(localPath, buffer);
  return { localPath, originalName, mimeType };
}

async function downloadSlackFiles(
  files: SlackFileInput[],
  botToken: string,
): Promise<
  Array<{ localPath: string; originalName: string; mimeType: string }>
> {
  const out: Array<{
    localPath: string;
    originalName: string;
    mimeType: string;
  }> = [];
  for (const file of files) {
    const url = file.url_private_download;
    if (!url || typeof url !== "string") continue;
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${botToken}` },
      });
      if (!res.ok) {
        log.warn("file download failed", {
          scope: "slack",
          name: file.name,
          status: res.status,
        });
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      const contentTypeHeader =
        res.headers.get("content-type")?.toLowerCase().split(";")[0].trim() ??
        "";
      if (contentTypeHeader === "text/html" || isHtmlResponse(buf)) {
        log.warn("file download returned HTML, skipping", {
          scope: "slack",
          name: file.name,
        });
        continue;
      }
      const name =
        typeof file.name === "string" && file.name.trim()
          ? file.name.trim()
          : "file";
      const mime =
        typeof file.mimetype === "string" && file.mimetype.trim()
          ? file.mimetype.trim().toLowerCase().split(";")[0].trim()
          : contentTypeHeader || "application/octet-stream";
      out.push(await saveBufferToAttachments(buf, name, mime));
    } catch (e) {
      log.warn("file download error", {
        scope: "slack",
        name: file.name,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return out;
}

function extractMentionedIds(text: string): string[] {
  const ids: string[] = [];
  const re = /<@([A-Z0-9]+)>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const id = m[1];
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

async function resolveMentionEntities(
  client: WebClient,
  userIds: string[],
): Promise<Array<{ name: string; id: string }>> {
  const out: Array<{ name: string; id: string }> = [];
  for (const id of userIds) {
    if (!id.trim()) continue;
    try {
      const u = await client.users.info({ user: id });
      const user = u.user as { real_name?: string; name?: string } | undefined;
      const name = user?.real_name || user?.name || id;
      out.push({ name, id });
    } catch {
      out.push({ name: id, id });
    }
  }
  return out;
}

async function resolveSlackUserDisplayName(
  client: WebClient,
  userId: string,
): Promise<string> {
  if (!userId.trim()) return userId;
  try {
    const userRes = (await client.users.info({ user: userId })) as {
      user?: {
        real_name?: string;
        name?: string;
        profile?: { real_name?: string; display_name?: string };
      };
    };
    const user = userRes.user;
    return (
      user?.real_name ||
      user?.profile?.real_name ||
      user?.profile?.display_name ||
      user?.name ||
      userId
    );
  } catch {
    return userId;
  }
}

async function resolveSlackChannelDisplayName(
  client: WebClient,
  channelId: string,
): Promise<{ name: string; replyInThread: boolean }> {
  const fallback = { name: channelId, replyInThread: true };
  try {
    const convRes = (await client.conversations.info({
      channel: channelId,
    })) as {
      channel?: {
        name?: string;
        is_im?: boolean;
        is_mpim?: boolean;
        user?: string;
        members?: string[];
      };
    };
    const ch = convRes.channel;
    const isIm = Boolean(ch?.is_im);
    const isMpim = Boolean(ch?.is_mpim);
    const replyInThread = !(isIm || isMpim);

    if (isIm) {
      const dmUserId = (ch?.user ?? "").trim();
      const name = dmUserId
        ? await resolveSlackUserDisplayName(client, dmUserId)
        : channelId;
      return { name, replyInThread };
    }

    if (isMpim) {
      let memberIds = Array.isArray(ch?.members)
        ? (ch?.members.filter((id): id is string => typeof id === "string") ??
          [])
        : [];
      if (memberIds.length === 0) {
        const fetched: string[] = [];
        let cursor: string | undefined;
        do {
          const membersRes = (await client.conversations.members({
            channel: channelId,
            limit: 200,
            cursor,
          })) as {
            members?: string[];
            response_metadata?: { next_cursor?: string };
          };
          fetched.push(...(membersRes.members ?? []));
          cursor = membersRes.response_metadata?.next_cursor;
        } while (cursor);
        memberIds = fetched;
      }
      const uniqueIds = Array.from(new Set(memberIds)).slice(0, 3);
      const names = await Promise.all(
        uniqueIds.map((id) => resolveSlackUserDisplayName(client, id)),
      );
      const rest = memberIds.length - names.length;
      const name =
        names.length > 0
          ? rest > 0
            ? `${names.join(", ")} & ${rest} more`
            : names.join(", ")
          : `Group DM (${channelId})`;
      return { name, replyInThread };
    }

    return { name: ch?.name?.trim() || channelId, replyInThread };
  } catch {
    return fallback;
  }
}

/**
 * Build {@link PlatformPrompt} from a Slack Events API envelope (Socket Mode body),
 * aligned with apps/backend slack-adapter: combined text + blocks, optional thread parent, files -> ~/.hoomanity/attachments.
 */
export async function buildSlackPlatformPrompt(
  envelope: SlackEnvelope,
  client: WebClient,
  botToken: string,
): Promise<PlatformPrompt | undefined> {
  const event = envelope.event;
  if (!event || event.type !== "message") {
    return undefined;
  }

  if (event.subtype === "bot_message" || event.bot_id) {
    return undefined;
  }

  const channelId = event.channel;
  if (!channelId || typeof channelId !== "string") {
    return undefined;
  }

  const rawText = typeof event.text === "string" ? event.text : "";
  const blocksText = textFromSlackBlocks(event.blocks);
  const effectiveText = combineSlackMessageText(rawText, event.blocks);
  const hasBlocks =
    Array.isArray(event.blocks) && (event.blocks as unknown[]).length > 0;
  const blocksSummary =
    hasBlocks && !effectiveText
      ? "Message includes blocks or interactive content."
      : undefined;

  const messageTs = event.ts ?? "";
  const threadTs = event.thread_ts;

  const messageFiles = (event.files as SlackFileInput[] | undefined) ?? [];
  const fromMessage = await downloadSlackFiles(messageFiles, botToken);
  let storedAttachments = [...fromMessage];

  let parentSlackMessage: Record<string, unknown> | null = null;
  let parentStored: Array<{
    localPath: string;
    originalName: string;
    mimeType: string;
  }> = [];
  if (threadTs && messageTs && threadTs !== messageTs) {
    try {
      const thread = await client.conversations.history({
        channel: channelId,
        latest: threadTs,
        limit: 1,
        inclusive: true,
      });
      const parent = thread.messages?.[0] as SlackMessageEvent | undefined;
      if (parent?.ts) {
        let parentSenderName = "";
        try {
          const pu = await client.users.info({ user: parent.user ?? "" });
          parentSenderName =
            (pu.user as { real_name?: string })?.real_name ||
            (pu.user as { name?: string })?.name ||
            parent.user ||
            "";
        } catch {
          parentSenderName = parent.user ?? "";
        }
        const parentFiles = Array.isArray(parent.files) ? parent.files : [];
        parentStored = await downloadSlackFiles(parentFiles, botToken);
        if (parentStored.length > 0) {
          storedAttachments = [
            ...storedAttachments,
            ...parentStored.map((a) => ({
              ...a,
              originalName: `thread_parent_${a.originalName}`,
            })),
          ];
        }
        const parentMentionIds = extractMentionedIds(parent.text ?? "");
        const parentMentions = await resolveMentionEntities(
          client,
          parentMentionIds,
        );
        const { name: channelName } = await resolveSlackChannelDisplayName(
          client,
          channelId,
        );
        const chEntity = slackChannelEntity(channelId, channelName);
        parentSlackMessage = {
          messageTs: parent.ts,
          channel: chEntity,
          sender: { name: parentSenderName, id: parent.user ?? "" },
          text: parent.text ?? "",
          blocks: Array.isArray(parent.blocks) ? parent.blocks : [],
          attachments: parentStored.map((a) => ({
            path: a.localPath,
            name: a.originalName,
            mime: a.mimeType,
          })),
          mentions: parentMentions,
        };
      }
    } catch {
      // ignore missing parent
    }
  }

  const hasContent =
    effectiveText.length > 0 ||
    storedAttachments.length > 0 ||
    blocksSummary != null;
  if (!hasContent) {
    return undefined;
  }

  const userIdFromSlack = typeof event.user === "string" ? event.user : "";
  let channelName = channelId;
  let senderName = "";
  let replyInThread = true;
  try {
    const [userRes, channelMeta] = await Promise.all([
      client.users.info({ user: userIdFromSlack }),
      resolveSlackChannelDisplayName(client, channelId),
    ]);
    senderName =
      (userRes.user as { real_name?: string })?.real_name ||
      (userRes.user as { name?: string })?.name ||
      userIdFromSlack;
    channelName = channelMeta.name;
    replyInThread = channelMeta.replyInThread;
  } catch {
    // fallbacks above
  }

  const textForMentions = effectiveText || rawText;
  const mentionedIds = extractMentionedIds(textForMentions);
  const mentions = await resolveMentionEntities(client, mentionedIds);
  const chEntity = slackChannelEntity(channelId, channelName);

  const slackMessage = {
    messageTs,
    channel: chEntity,
    sender: { name: senderName, id: userIdFromSlack },
    text: effectiveText,
    blocks: Array.isArray(event.blocks) ? event.blocks : [],
    attachments: fromMessage.map((a) => ({
      path: a.localPath,
      name: a.originalName,
      mime: a.mimeType,
    })),
    mentions,
    parent: parentSlackMessage,
    replyInThread,
  };

  const promptText = effectiveText || (blocksSummary ?? "");

  const replyTarget: PlatformReplyTarget = {
    platform: "slack",
    channelId,
    threadTs: threadTs ?? (messageTs || undefined),
  };

  return {
    platform: "slack",
    conversationKey: toConversationKey(channelId),
    text: promptText,
    attachments: storedAttachments.length > 0 ? storedAttachments : undefined,
    metadata: {
      source: "slack_socket_mode",
      teamId: envelope.team_id,
      channelMeta: {
        channel: "slack",
        message: slackMessage,
      },
      blocksSummary: blocksSummary ?? null,
      blocksText: blocksText || null,
      rawText: rawText || null,
      rawEvent: envelope,
    },
    replyTarget,
    receivedAt: Date.now(),
  };
}
