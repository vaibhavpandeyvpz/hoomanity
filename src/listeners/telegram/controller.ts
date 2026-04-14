import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { Telegram } from "telegraf";
import type { ApprovalService } from "../../core/approval-service";
import type { CoreOrchestrator } from "../../core/orchestrator";
import type { SessionRegistry } from "../../core/session-registry";
import { isAllowedByAllowlist } from "../../core/allowlist";
import { log } from "../../core/logger";
import { attachmentsDir } from "../../paths";
import { parseUserControlCommand } from "../../core/stop-command";
import {
  type IdAllowlist,
  type PlatformReplyTarget,
  type StoredAttachment,
} from "../../contracts";
import { TelegramActions, parseTelegramApprovalText } from "./actions";
import {
  buildTelegramPlatformPrompt,
  extractTelegramText,
  mediaRefsFromTelegramMessage,
  parseTelegramApprovalCallback,
  toTelegramConversationKey,
  type TelegramInboundMessage,
} from "./build-prompt";
import { TelegramReplies } from "./replies";
import {
  telegramChatIsPrivate,
  telegramMessageMentionsBot,
} from "./mention-guard";

export type TelegramCallbackQuery = {
  data?: string;
  message?: {
    chat?: { id?: number | string };
  };
};

export class TelegramMessageController {
  private readonly actions: TelegramActions;
  private botId: number | undefined;
  private botUsername: string | undefined;
  private readonly pendingByChatId = new Map<string, string>();
  private readonly chatByRequestId = new Map<string, string>();
  private readonly approvalOptionsByRequestId = new Map<
    string,
    Array<{ optionId: string; label: string }>
  >();

  constructor(
    private readonly allowlist: IdAllowlist,
    private readonly requireMention: boolean,
    private readonly orchestrator: CoreOrchestrator,
    private readonly replies: () => TelegramReplies | undefined,
    private readonly telegram: () => Telegram | undefined,
    approvals: ApprovalService,
    sessions: SessionRegistry,
  ) {
    this.actions = new TelegramActions(approvals);
    approvals.subscribe(async (request) => {
      const binding = sessions.getBySessionId(request.sessionId);
      if (!binding || binding.replyTarget.platform !== "telegram") {
        return;
      }
      const chatId = binding.replyTarget.channelId;
      this.pendingByChatId.set(chatId, request.requestId);
      this.chatByRequestId.set(request.requestId, chatId);
      const mappedOptions = request.options.map((option) => ({
        optionId: option.optionId,
        label: option.name,
      }));
      this.approvalOptionsByRequestId.set(request.requestId, mappedOptions);
      log.info("cached approval options", {
        scope: "telegram",
        requestId: request.requestId,
        optionCount: mappedOptions.length,
      });
      await this.replies()?.postApproval(binding.replyTarget, request);
    });
  }

  setBotIdentity(identity: { id: number; username?: string }): void {
    this.botId = identity.id;
    this.botUsername = identity.username?.trim() || undefined;
  }

  clearState(): void {
    this.pendingByChatId.clear();
    this.chatByRequestId.clear();
    this.approvalOptionsByRequestId.clear();
  }

  async handleMessage(message: TelegramInboundMessage): Promise<void> {
    const target = toReplyTarget(message);
    if (!target) {
      return;
    }
    if (!isAllowedByAllowlist(target.channelId, this.allowlist)) {
      log.info("ignoring message from disallowed chat", {
        scope: "telegram",
        chatId: target.channelId,
      });
      return;
    }

    const plain = extractTelegramText(message);
    const control = parseUserControlCommand(plain);
    if (control === "cancel") {
      const { cancelled } = await this.orchestrator.cancelInFlight(
        toTelegramConversationKey(target.channelId),
      );
      await this.replies()?.postText(
        target,
        cancelled
          ? "Cancellation sent (in-flight work and pending approvals)."
          : "Nothing to cancel for this chat yet.",
      );
      return;
    }
    if (control === "reset") {
      try {
        await this.orchestrator.resetConversation(
          toTelegramConversationKey(target.channelId),
          target,
        );
        await this.replies()?.postText(
          target,
          "Started a fresh chat for this conversation.",
        );
      } catch (error) {
        await this.replies()?.postError(target, error);
      }
      return;
    }

    const pendingRequestId = this.pendingByChatId.get(target.channelId);
    if (pendingRequestId && plain) {
      const intent = parseTelegramApprovalText(plain);
      if (intent === "cancel") {
        const resolved =
          this.actions.resolveCancelByRequestId(pendingRequestId);
        if (resolved) {
          this.clearPending(pendingRequestId);
          await this.replies()?.sendText(
            target.channelId,
            "Approval cancelled.",
          );
          return;
        }
      }
    }

    if (
      this.requireMention &&
      !telegramChatIsPrivate(message) &&
      this.botId != null &&
      !telegramMessageMentionsBot(message, this.botId, this.botUsername)
    ) {
      log.info("ignoring message without bot mention", {
        scope: "telegram",
        chatId: target.channelId,
      });
      return;
    }

    const attachments = await this.downloadMessageAttachments(message);
    const prompt = buildTelegramPlatformPrompt(
      message,
      attachments,
      this.botId != null
        ? { id: this.botId, username: this.botUsername }
        : undefined,
    );
    if (!prompt) {
      return;
    }

    try {
      await this.telegram()?.sendChatAction(target.channelId, "typing");
    } catch {
      // best-effort typing indicator
    }

    const messageId =
      typeof message.message_id === "number" ? message.message_id : undefined;
    if (messageId != null) {
      await setProcessingReaction(
        this.telegram(),
        target.channelId,
        messageId,
        "add",
      );
    }

    try {
      await this.orchestrator.enqueuePrompt(prompt, {
        onCompleted: async (result) => {
          await this.replies()?.postFinal(prompt.replyTarget, result);
        },
        onError: async (error) => {
          await this.replies()?.postError(prompt.replyTarget, error);
        },
      });
    } finally {
      if (messageId != null) {
        await setProcessingReaction(
          this.telegram(),
          target.channelId,
          messageId,
          "remove",
        );
      }
    }
  }

  async handleCallbackQuery(query: TelegramCallbackQuery): Promise<boolean> {
    const action = parseTelegramApprovalCallback(query.data);
    if (!action) {
      return false;
    }
    let resolved = false;
    let label: string | undefined;

    if (action.action === "cancel") {
      resolved = this.actions.resolveCancelByRequestId(action.requestId);
      label = "Cancel";
    } else {
      const options = this.approvalOptionsByRequestId.get(action.requestId);
      if (!options) {
        log.warn("no cached options for approval callback", {
          scope: "telegram",
          requestId: action.requestId,
          knownRequestIds: [...this.approvalOptionsByRequestId.keys()],
        });
        return false;
      }
      const selected =
        action.optionIndex == null ? undefined : options[action.optionIndex];
      if (!selected) {
        log.warn("option index out of range", {
          scope: "telegram",
          requestId: action.requestId,
          optionIndex: action.optionIndex,
          availableOptions: options.length,
        });
        return false;
      }
      resolved = this.actions.resolveSelection(
        action.requestId,
        selected.optionId,
      );
      label = selected.label;
    }

    if (!resolved) {
      log.warn("approval resolution returned false", {
        scope: "telegram",
        requestId: action.requestId,
        action: action.action,
      });
      return false;
    }

    this.clearPending(action.requestId);
    if (label) {
      void this.replies()
        ?.markApprovalResolved(action.requestId, label)
        .catch((error: unknown) => {
          log.warn("failed to update approval message", {
            scope: "telegram",
            requestId: action.requestId,
            label,
            error: error instanceof Error ? error.message : String(error),
          });
        });
    }
    return true;
  }

  private async downloadMessageAttachments(
    message: TelegramInboundMessage,
  ): Promise<StoredAttachment[]> {
    const telegram = this.telegram();
    if (!telegram) {
      return [];
    }
    const refs = mediaRefsFromTelegramMessage(message);
    if (refs.length === 0) {
      return [];
    }
    const out: StoredAttachment[] = [];
    for (const ref of refs) {
      try {
        const url = await telegram.getFileLink(ref.fileId);
        const res = await fetch(url);
        if (!res.ok) {
          continue;
        }
        const buffer = Buffer.from(await res.arrayBuffer());
        out.push(await saveAttachment(buffer, ref.originalName, ref.mimeType));
      } catch (error) {
        log.warn("failed to download attachment", {
          scope: "telegram",
          fileId: ref.fileId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return out;
  }

  private clearPending(requestId: string): void {
    const chatId = this.chatByRequestId.get(requestId);
    if (chatId) {
      this.pendingByChatId.delete(chatId);
    }
    this.chatByRequestId.delete(requestId);
    this.approvalOptionsByRequestId.delete(requestId);
  }
}

async function saveAttachment(
  buffer: Buffer,
  originalName: string,
  mimeType: string,
): Promise<StoredAttachment> {
  const root = attachmentsDir;
  await mkdir(root, { recursive: true });
  const safeName = originalName.replace(/[/\\]/g, "_").slice(0, 200) || "file";
  const localPath = join(root, `${randomUUID()}-${safeName}`);
  await writeFile(localPath, buffer);
  return {
    localPath,
    originalName: safeName,
    mimeType,
  };
}

function toReplyTarget(
  message: TelegramInboundMessage,
): PlatformReplyTarget | undefined {
  const chatId = message.chat?.id;
  if (chatId == null) {
    return undefined;
  }
  return {
    platform: "telegram",
    channelId: String(chatId),
    threadTs:
      typeof message.message_thread_id === "number"
        ? String(message.message_thread_id)
        : undefined,
  };
}

async function setProcessingReaction(
  telegram: Telegram | undefined,
  chatId: string,
  messageId: number,
  action: "add" | "remove",
): Promise<void> {
  if (!telegram) {
    return;
  }
  try {
    await telegram.setMessageReaction(
      chatId,
      messageId,
      action === "add" ? [{ type: "emoji", emoji: "👀" }] : [],
    );
  } catch (error) {
    log.warn(`failed to ${action} processing reaction`, {
      scope: "telegram",
      chatId,
      messageId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
