import wwebjs from "whatsapp-web.js";
const { Client, LocalAuth } = wwebjs;
import qrcode from "qrcode-terminal";
import { BaseChannel } from "./base.js";
import { formatUnixSecondsLocal } from "./format-sent-at.js";
import { InboundAttachmentSessionContext } from "./inbound-attachments.js";
import { whatsAppMentionPayload } from "./mentions.js";
import type {
  ChannelAttachmentRef,
  ChannelType,
  WhatsAppMessage,
  WhatsAppParentMessage,
} from "./types.js";
import {
  type WhatsAppLastContext,
  whatsAppEffectiveSenderId,
  whatsAppForwardedDisplayBody,
  whatsAppMessageSerializedId,
} from "./whatsapp-inbound-shapes.js";
import { agentDir, agentWwebjsCacheDir } from "../store/paths.js";
import { log } from "../logging/app-logger.js";
import { sessionIdForWhatsApp } from "../engine/memory/session-ids.js";
import type { AiSdkTextModel } from "../providers/types.js";
import type { McpApprovalChoice } from "../store/allowance.js";

const WHATSAPP_PROCESSING_EMOJI = "👀";
/** Shown on the user's message while a tool approval is pending (reply yes / always / no in chat). */
const WHATSAPP_APPROVAL_EMOJI = "🔐";

export class WhatsAppChannel extends BaseChannel {
  readonly id: string;
  readonly type: ChannelType = "whatsapp";
  readonly supportsStreaming = false;
  private client: wwebjs.Client;
  private lastContext: WhatsAppLastContext | null = null;
  /** Message that has 🔐 while approval is pending (cleared when user replies yes/no). */
  private approvalPromptMessageId: string | null = null;
  private readonly inboundFiles: InboundAttachmentSessionContext;

  constructor(
    model: AiSdkTextModel,
    agentId: string,
    sessionName: string = "default",
    inboundFiles: InboundAttachmentSessionContext,
  ) {
    super(model);
    this.inboundFiles = inboundFiles;
    this.id = `whatsapp-${sessionName}`;
    this.client = new Client({
      authStrategy: new LocalAuth({
        dataPath: agentDir(agentId),
        clientId: `whatsapp-${sessionName}`,
      }),
      webVersionCache: {
        type: "local",
        path: agentWwebjsCacheDir(agentId),
      },
      puppeteer: {
        args: ["--no-sandbox"],
      },
    });

    this.client.on("qr", (qr) => {
      log.info(`[WhatsApp ${this.id}] Scan this QR code to login:`);
      qrcode.generate(qr, { small: true });
    });

    this.client.on("ready", () => {
      log.info(`[WhatsApp ${this.id}] Client is ready!`);
    });

    this.client.on("message", (message) => {
      void this.ingestInboundMessage(message);
    });
  }

  private async loadProfileAndChat(
    message: wwebjs.Message,
    senderId: string,
  ): Promise<{
    profile: { id: string; name: string };
    chatMeta: { id: string; name: string; isGroup: boolean };
  }> {
    let profile = { id: senderId, name: "Unknown" };
    let chatMeta = { id: message.from, name: "Unknown", isGroup: false };
    try {
      const contact = await message.getContact();
      profile = {
        id: senderId,
        name: contact.pushname || contact.name || "Unknown",
      };
      const chat = await message.getChat();
      chatMeta = {
        id: chat.id._serialized,
        name: chat.name,
        isGroup: chat.isGroup,
      };
    } catch (err) {
      log.warn(`[WhatsApp ${this.id}] Error fetching context:`, err);
    }
    return { profile, chatMeta };
  }

  /** Saves one media attachment for a message; `namePrefix` is prepended to the file basename (e.g. `quoted_`). */
  private async saveMediaToSession(
    message: wwebjs.Message,
    sessionId: string,
    namePrefix: string,
  ): Promise<ChannelAttachmentRef | null> {
    if (!message.hasMedia) {
      return null;
    }
    try {
      const media = await message.downloadMedia();
      const buf = Buffer.from(media.data, "base64");
      const baseName =
        media.filename?.trim() ||
        `whatsapp_media.${(media.mimetype ?? "application/octet-stream").split("/")[1]?.split(";")[0] || "bin"}`;
      const originalName = `${namePrefix}${baseName}`;
      return await this.inboundFiles.save(sessionId, {
        buffer: buf,
        originalName,
        mimeType: media.mimetype || "application/octet-stream",
      });
    } catch (err) {
      log.warn(`[WhatsApp ${this.id}] downloadMedia failed:`, err);
      return null;
    }
  }

  private async buildQuotedParent(
    message: wwebjs.Message,
    sessionId: string,
  ): Promise<{
    parent?: WhatsAppParentMessage;
    quotedRefs: ChannelAttachmentRef[];
  }> {
    if (!message.hasQuotedMsg) {
      return { quotedRefs: [] };
    }
    try {
      const quoted = await message.getQuotedMessage();
      const qBody = quoted.body?.trim() ?? "";
      const qSender =
        typeof quoted.author === "string" && quoted.author.trim().length > 0
          ? quoted.author
          : quoted.from;
      const quotedSaved = await this.saveMediaToSession(
        quoted,
        sessionId,
        "quoted_",
      );
      const qAtt = quotedSaved ? [quotedSaved] : [];
      const qMention = whatsAppMentionPayload(quoted);
      const parent: WhatsAppParentMessage = {
        messageId: whatsAppMessageSerializedId(quoted) ?? undefined,
        senderId: qSender,
        ...(qBody ? { text: qBody } : {}),
        ...(qAtt.length > 0 ? { attachments: qAtt } : {}),
        ...(qMention.mentions ? { mentions: qMention.mentions } : {}),
        ...(qMention.groupMentions
          ? { groupMentions: qMention.groupMentions }
          : {}),
      };
      return { parent, quotedRefs: qAtt };
    } catch (err) {
      log.warn(`[WhatsApp ${this.id}] getQuotedMessage failed:`, err);
      return { quotedRefs: [] };
    }
  }

  private async ingestInboundMessage(message: wwebjs.Message): Promise<void> {
    if (message.fromMe) {
      return;
    }

    const senderId = whatsAppEffectiveSenderId(message);

    const { profile, chatMeta } = await this.loadProfileAndChat(
      message,
      senderId,
    );

    const serializedId = whatsAppMessageSerializedId(message);
    const sentAt =
      typeof message.timestamp === "number" &&
      Number.isFinite(message.timestamp)
        ? formatUnixSecondsLocal(message.timestamp)
        : undefined;

    this.lastContext = {
      chatId: message.from,
      messageId: serializedId,
      profile,
      chat: chatMeta,
      ...(sentAt ? { sentAt } : {}),
    };

    const sessionId = sessionIdForWhatsApp(message.from);
    const attachments: ChannelAttachmentRef[] = [];

    const mainSaved = await this.saveMediaToSession(message, sessionId, "");
    if (mainSaved) {
      attachments.push(mainSaved);
    }

    const { parent, quotedRefs } = await this.buildQuotedParent(
      message,
      sessionId,
    );
    attachments.push(...quotedRefs);

    const forwarded = Boolean(message.isForwarded);
    const bodyText = whatsAppForwardedDisplayBody(
      message.body?.trim() ?? "",
      forwarded,
      attachments.length > 0,
    );

    if (!bodyText && attachments.length === 0) {
      return;
    }

    const mainMention = whatsAppMentionPayload(message);
    const waMessage: WhatsAppMessage = {
      channel: "whatsapp",
      text: bodyText,
      chatId: message.from,
      messageId: serializedId ?? undefined,
      senderId,
      senderName: profile.name,
      threadName: chatMeta.name,
      isGroup: chatMeta.isGroup,
      ...(sentAt ? { sentAt } : {}),
      ...(forwarded ? { forwarded: true } : {}),
      ...(attachments.length > 0 ? { attachments } : {}),
      ...(mainMention.mentions ? { mentions: mainMention.mentions } : {}),
      ...(mainMention.groupMentions
        ? { groupMentions: mainMention.groupMentions }
        : {}),
      ...(parent ? { parent } : {}),
    };
    await this.handleIncomingMessage(waMessage);
  }

  async start(): Promise<void> {
    await this.client.initialize();
  }

  async sendMessage(text: string): Promise<void> {
    const chatId = this.lastContext?.chatId;
    if (!chatId) {
      log.warn(`[WhatsApp ${this.id}] No chat ID to send message.`);
      return;
    }
    await this.client.sendMessage(chatId, text);
  }

  /** Empty string removes the reaction. */
  private async reactOnMessageById(
    serializedId: string | null | undefined,
    emoji: string,
  ): Promise<void> {
    if (serializedId == null || serializedId === "") {
      return;
    }
    try {
      const msg = await this.client.getMessageById(serializedId);
      if (!msg) {
        log.warn(
          `[WhatsApp ${this.id}] reactOnMessageById: message not found id=${serializedId}`,
        );
        return;
      }
      await msg.react(emoji);
    } catch (err: unknown) {
      log.warn(`[WhatsApp ${this.id}] reactOnMessageById failed:`, err);
    }
  }

  /** React on the latest inbound user message (`lastContext`). */
  private async reactOnLastInboundMessage(emoji: string): Promise<void> {
    await this.reactOnMessageById(this.lastContext?.messageId, emoji);
  }

  /** Emoji reaction on the inbound user message while the agent runs. */
  async setProcessingIndicator(action: "add" | "remove"): Promise<void> {
    await this.reactOnLastInboundMessage(
      action === "add" ? WHATSAPP_PROCESSING_EMOJI : "",
    );
  }

  protected override async deliverApprovalPrompt(
    approvalMessage: string,
  ): Promise<void> {
    const id = this.lastContext?.messageId;
    if (id == null || id === "") {
      this.approvalPromptMessageId = null;
      log.warn(
        `[WhatsApp ${this.id}] No inbound message id for approval reaction; sending text.`,
      );
      await super.deliverApprovalPrompt(approvalMessage);
      return;
    }
    this.approvalPromptMessageId = id;
    await this.reactOnMessageById(id, WHATSAPP_APPROVAL_EMOJI);
    log.info(
      `[WhatsApp ${this.id}] Tool approval pending — user sees ${WHATSAPP_APPROVAL_EMOJI} on their message; reply yes, always, or no.`,
    );
  }

  protected override async onApprovalResolved(
    _choice: McpApprovalChoice,
  ): Promise<void> {
    const promptId = this.approvalPromptMessageId;
    this.approvalPromptMessageId = null;
    if (promptId) {
      await this.reactOnMessageById(promptId, "");
    }
    const replyId = this.lastContext?.messageId;
    if (replyId && replyId !== promptId) {
      await this.reactOnMessageById(replyId, WHATSAPP_PROCESSING_EMOJI);
    }
  }

  async stop(): Promise<void> {
    await this.client.destroy();
  }

  override getMetadata(): unknown {
    return {
      channel: "whatsapp",
      whatsapp: this.lastContext,
    };
  }
}
