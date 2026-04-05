import pkg from "@slack/bolt";
import type { SlackEventMiddlewareArgs } from "@slack/bolt";
const { App } = pkg;
import { BaseChannel } from "./base.js";
import { formatSlackTsLocal } from "./format-sent-at.js";
import type {
  ChannelAttachmentRef,
  ChannelType,
  SlackMessage,
  SlackParentMessage,
} from "./types.js";
import { log } from "../logging/app-logger.js";
import { sessionIdForSlackChannel } from "../engine/memory/session-ids.js";
import { InboundAttachmentSessionContext } from "./inbound-attachments.js";
import { slackParentMentions } from "./mentions.js";
import type { AiSdkTextModel } from "../providers/types.js";
import {
  inboundMessageFiles,
  isIgnoredSlackInboundMessage,
  type SlackBoltInboundMessage,
  type SlackLastContext,
  type SlackMessageFileRow,
  type SlackThreadApiMessage,
  slackInboundUserMessageShape,
  slackWebApiErrorCode,
} from "./slack-inbound-shapes.js";

export interface SlackChannelOptions {
  signingSecret: string;
  /** Bot token (xoxb-). Omit or empty when using only {@link userToken}. */
  token?: string;
  appToken?: string;
  /**
   * User token (xoxp-...). If {@link token} is set, this must be set (file downloads). If {@link token}
   * is omitted, this token is used for Bolt and all Web API calls including files.
   */
  userToken?: string;
  /** Shared saver (same agent + quota as WhatsApp for this run). */
  inboundFiles: InboundAttachmentSessionContext;
}

export class SlackChannel extends BaseChannel {
  readonly id: string;
  readonly type: ChannelType = "slack";
  readonly supportsStreaming = false;
  private app: pkg.App;
  private readonly inboundFiles: InboundAttachmentSessionContext;
  /** Always the user token when valid config (required for files whenever a bot token exists). */
  private readonly fileDownloadToken: string;
  private lastContext: SlackLastContext | null = null;

  constructor(model: AiSdkTextModel, options: SlackChannelOptions) {
    super(model);
    this.inboundFiles = options.inboundFiles;
    const bot = options.token?.trim() ?? "";
    const user = options.userToken?.trim() ?? "";
    if (!bot && !user) {
      throw new Error(
        "Slack: set a user token alone, or a bot token plus a user token.",
      );
    }
    if (bot && !user) {
      throw new Error(
        "Slack: user token is required when a bot token is set (file access).",
      );
    }
    const boltToken = bot || user;
    this.fileDownloadToken = user;
    this.id = `slack-${boltToken.slice(-4)}`;
    this.app = new App({
      signingSecret: options.signingSecret,
      token: boltToken,
      appToken: options.appToken,
      socketMode: true,
    });

    this.app.message(
      async ({ message }: SlackEventMiddlewareArgs<"message">) => {
        await this.onSlackMessage(message);
      },
    );
  }

  private async downloadSlackFileToBuffer(url: string): Promise<Buffer> {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.fileDownloadToken}` },
    });
    if (!res.ok) {
      throw new Error(`Slack file HTTP ${res.status}`);
    }
    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    if (ct.includes("text/html")) {
      throw new Error("Slack file response was HTML (auth or scope error?)");
    }
    return Buffer.from(await res.arrayBuffer());
  }

  private async saveSlackFileList(
    sessionId: string,
    files: readonly SlackMessageFileRow[],
    namePrefix: string,
  ): Promise<ChannelAttachmentRef[]> {
    const out: ChannelAttachmentRef[] = [];
    for (const f of files) {
      const url = f.url_private_download;
      if (!url) continue;
      try {
        const buf = await this.downloadSlackFileToBuffer(url);
        const originalName = `${namePrefix}${f.name ?? f.title ?? `file.${f.filetype ?? "bin"}`}`;
        const mime = f.mimetype?.trim() || "application/octet-stream";
        const saved = await this.inboundFiles.save(sessionId, {
          buffer: buf,
          originalName,
          mimeType: mime,
        });
        out.push(saved);
      } catch (err) {
        log.warn(`[Slack ${this.id}] file download failed:`, err);
      }
    }
    return out;
  }

  private async resolveSlackUserName(userId: string): Promise<string> {
    if (!userId.trim()) {
      return "Unknown";
    }
    try {
      const userInfo = await this.app.client.users.info({ user: userId });
      if (userInfo.ok && userInfo.user) {
        return userInfo.user.real_name || userInfo.user.name || "Unknown";
      }
    } catch (err) {
      log.warn(`[Slack ${this.id}] users.info failed for ${userId}:`, err);
    }
    return "Unknown";
  }

  private async fetchThreadParentMessage(
    channelId: string,
    threadTs: string,
  ): Promise<SlackThreadApiMessage | null> {
    try {
      const res = await this.app.client.conversations.replies({
        channel: channelId,
        ts: threadTs,
        limit: 1,
      });
      if (!res.ok || !res.messages?.[0]) {
        return null;
      }
      return res.messages[0];
    } catch (err) {
      log.warn(`[Slack ${this.id}] conversations.replies failed:`, err);
      return null;
    }
  }

  /**
   * Thread reply: load parent message, optional files/blocks/mentions, and return refs to merge
   * into the child message’s top-level `attachments` list.
   */
  private async buildSlackThreadParentPayload(
    channelId: string,
    threadTsRaw: string,
    sessionId: string,
  ): Promise<{
    parent: SlackParentMessage;
    parentAttachments: ChannelAttachmentRef[];
  } | null> {
    const parentRaw = await this.fetchThreadParentMessage(
      channelId,
      threadTsRaw,
    );
    if (!parentRaw) {
      return null;
    }
    const pTs = parentRaw.ts?.trim() ? parentRaw.ts : threadTsRaw;
    const pText = parentRaw.text?.trim() ?? "";
    const pUser =
      typeof parentRaw.user === "string" ? parentRaw.user : undefined;
    const pUserName = pUser
      ? await this.resolveSlackUserName(pUser)
      : undefined;
    const pFiles = parentRaw.files ?? [];
    const parentAtt =
      pFiles.length > 0
        ? await this.saveSlackFileList(sessionId, pFiles, "thread_parent_")
        : [];
    const pBlocks = parentRaw.blocks;
    const hasBlocks = pBlocks !== undefined && pBlocks !== null;
    const parentMentions = slackParentMentions(
      pText || undefined,
      hasBlocks ? pBlocks : undefined,
    );
    const parent: SlackParentMessage = {
      messageTs: pTs,
      ...(pText ? { text: pText } : {}),
      ...(pUser ? { userId: pUser } : {}),
      ...(pUserName ? { userName: pUserName } : {}),
      ...(parentAtt.length > 0 ? { attachments: parentAtt } : {}),
      ...(hasBlocks ? { blocks: pBlocks } : {}),
      ...(parentMentions.length > 0 ? { mentions: parentMentions } : {}),
    };
    return { parent, parentAttachments: parentAtt };
  }

  private async onSlackMessage(m: SlackBoltInboundMessage): Promise<void> {
    if (isIgnoredSlackInboundMessage(m)) {
      return;
    }

    const shape = slackInboundUserMessageShape(m);
    if (!shape) {
      return;
    }
    const { text, user, channelId, ts, threadTsRaw } = shape;

    const profile = { id: user, name: await this.resolveSlackUserName(user) };

    const sentAt = formatSlackTsLocal(ts);
    const replyThreadTs = threadTsRaw;

    this.lastContext = {
      channelId,
      threadTs: replyThreadTs,
      userId: user,
      profile,
      ts,
      ...(sentAt ? { sentAt } : {}),
    };

    const trimmed = text.trim();
    const files = inboundMessageFiles(m);
    const hasFiles = files.length > 0;
    if (!trimmed && !hasFiles) {
      return;
    }

    const sessionId = sessionIdForSlackChannel(channelId);
    const attachments: ChannelAttachmentRef[] = hasFiles
      ? await this.saveSlackFileList(sessionId, files, "")
      : [];

    let parent: SlackParentMessage | undefined;
    if (threadTsRaw && ts && threadTsRaw !== ts) {
      const threadPayload = await this.buildSlackThreadParentPayload(
        channelId,
        threadTsRaw,
        sessionId,
      );
      if (threadPayload) {
        parent = threadPayload.parent;
        attachments.push(...threadPayload.parentAttachments);
      }
    }

    const slackMessage: SlackMessage = {
      channel: "slack",
      text: trimmed,
      channelId,
      messageTs: ts,
      threadTs: threadTsRaw,
      userId: user,
      userName: profile.name,
      ...(sentAt ? { sentAt } : {}),
      ...(attachments.length > 0 ? { attachments } : {}),
      ...(parent ? { parent } : {}),
    };
    await this.handleIncomingMessage(slackMessage);
  }

  async start(): Promise<void> {
    await this.app.start();
    log.info(`Slack channel ${this.id} started.`);
  }

  async sendMessage(text: string): Promise<void> {
    if (!this.lastContext) {
      log.warn(`[Slack ${this.id}] No context to send message.`);
      return;
    }

    const { channelId, threadTs } = this.lastContext;
    await this.app.client.chat.postMessage({
      channel: channelId,
      ...(threadTs != null && threadTs !== "" ? { thread_ts: threadTs } : {}),
      text,
    });
  }

  /** `:eyes:` on the inbound user message while the agent runs (needs `reactions:write`). */
  async setProcessingIndicator(action: "add" | "remove"): Promise<void> {
    const ctx = this.lastContext;
    if (!ctx?.channelId || !ctx.ts) {
      return;
    }
    try {
      if (action === "add") {
        await this.app.client.reactions.add({
          channel: ctx.channelId,
          timestamp: ctx.ts,
          name: "eyes",
        });
      } else {
        await this.app.client.reactions.remove({
          channel: ctx.channelId,
          timestamp: ctx.ts,
          name: "eyes",
        });
      }
    } catch (err: unknown) {
      const code = slackWebApiErrorCode(err);
      if (action === "add" && code === "already_reacted") {
        return;
      }
      if (action === "remove" && code === "no_reaction") {
        return;
      }
      log.warn(
        `[Slack ${this.id}] setProcessingIndicator(${action}) failed:`,
        err,
      );
    }
  }

  async stop(): Promise<void> {
    await this.app.stop();
  }

  override getMetadata(): unknown {
    return {
      channel: "slack",
      slack: this.lastContext,
    };
  }
}
