import type { ApprovalService } from "../../core/approval-service";
import { isAllowedByAllowlist, type IdAllowlist } from "../../core/allowlist";
import type { CoreOrchestrator } from "../../core/orchestrator";
import type { SessionRegistry } from "../../core/session-registry";
import { log } from "../../core/logger";
import { parseUserControlCommand } from "../../core/stop-command";
import {
  resolveApprovalFromText,
  type WhatsAppPendingApproval,
} from "./approvals";
import {
  buildWhatsAppPlatformPrompt,
  toWhatsAppConversationKey,
  type WhatsAppMessage,
} from "./build-prompt";
import { WhatsAppReplies } from "./replies";
import {
  whatsappMessageChatNeedsMention,
  whatsappMessageMentionsAnyWid,
} from "./mention-guard";

export type WhatsAppRuntimeConfig = {
  session_path?: string;
  client_id?: string;
  puppeteer_executable_path?: string;
  require_mention?: boolean;
};

export class WhatsAppMessageController {
  private readonly pendingByChatId = new Map<string, WhatsAppPendingApproval>();
  private botWids: string[] = [];
  private botUsername: string | null = null;

  constructor(
    private readonly allowlist: IdAllowlist,
    private readonly requireMention: boolean,
    private readonly orchestrator: CoreOrchestrator,
    private readonly approvals: ApprovalService,
    private readonly replies: () => WhatsAppReplies | undefined,
    sessions: SessionRegistry,
  ) {
    approvals.subscribe(async (request) => {
      const binding = sessions.getBySessionId(request.sessionId);
      if (
        !binding ||
        binding.replyTarget.platform !== "whatsapp" ||
        !this.replies()
      ) {
        return;
      }
      this.pendingByChatId.set(binding.replyTarget.channelId, {
        requestId: request.requestId,
        options: request.options,
      });
      await this.replies()?.postApproval(binding.replyTarget, request);
    });
  }

  setBotWids(wids: string[], username?: string | null): void {
    this.botWids = wids.map((w) => w.trim()).filter(Boolean);
    this.botUsername =
      typeof username === "string" && username.trim() ? username.trim() : null;
  }

  clearState(): void {
    this.pendingByChatId.clear();
  }

  async handleMessage(message: WhatsAppMessage & Record<string, unknown>) {
    if (message.fromMe) return;
    const chatId = message.from?.trim();
    if (!chatId) return;
    if (!isAllowedByAllowlist(chatId, this.allowlist)) {
      log.info("ignoring message from disallowed chat", {
        scope: "whatsapp",
        chatId,
      });
      return;
    }

    const bodyTrim = (message.body ?? "").trim();
    const control = parseUserControlCommand(bodyTrim);
    if (control === "cancel") {
      const key = toWhatsAppConversationKey(chatId);
      const { cancelled } = await this.orchestrator.cancelInFlight(key);
      if (this.replies()) {
        await this.replies()?.postText(
          { platform: "whatsapp", channelId: chatId },
          cancelled
            ? "Cancellation sent (in-flight work and pending approvals)."
            : "Nothing to cancel for this chat yet.",
        );
      }
      return;
    }
    if (control === "reset") {
      try {
        await this.orchestrator.resetConversation(
          toWhatsAppConversationKey(chatId),
          {
            platform: "whatsapp",
            channelId: chatId,
          },
        );
        if (this.replies()) {
          await this.replies()?.postText(
            { platform: "whatsapp", channelId: chatId },
            "Started a fresh chat for this conversation.",
          );
        }
      } catch (error) {
        await this.replies()?.postError(
          { platform: "whatsapp", channelId: chatId },
          error,
        );
      }
      return;
    }

    const pending = this.pendingByChatId.get(chatId);
    if (pending) {
      const resolved = resolveApprovalFromText(
        this.approvals,
        pending,
        message.body ?? "",
      );
      if (resolved) {
        this.pendingByChatId.delete(chatId);
        log.info("approval resolved via text reply", {
          scope: "whatsapp",
          chatId,
          requestId: pending.requestId,
        });
        if (this.replies()) {
          await this.replies()?.postText(
            { platform: "whatsapp", channelId: chatId },
            "Approval received.",
          );
        }
        return;
      }
    }

    const chatNeedsMention =
      this.requireMention &&
      this.botWids.length > 0 &&
      (await whatsappMessageChatNeedsMention(message));
    if (
      chatNeedsMention &&
      !whatsappMessageMentionsAnyWid(message.mentionedIds, this.botWids)
    ) {
      log.info("ignoring message without bot mention", {
        scope: "whatsapp",
        chatId,
      });
      return;
    }

    const prompt = await buildWhatsAppPlatformPrompt(message, {
      id: this.botWids[0] ?? null,
      username: this.botUsername,
      wids: this.botWids,
    });
    if (!prompt || !this.replies()) return;

    await setWhatsAppProcessingReaction(message, "add");
    try {
      const turn = await this.orchestrator.enqueuePrompt(prompt, {
        onCompleted: async (result) => {
          await this.replies()?.postFinal(prompt.replyTarget, result);
        },
        onError: async (error) => {
          await this.replies()?.postError(prompt.replyTarget, error);
        },
      });
      if (turn === undefined) {
        return;
      }
    } finally {
      await setWhatsAppProcessingReaction(message, "remove");
    }
  }
}

async function setWhatsAppProcessingReaction(
  message: WhatsAppMessage & Record<string, unknown>,
  action: "add" | "remove",
): Promise<void> {
  const react = message.react;
  if (typeof react !== "function") {
    return;
  }
  try {
    await react(action === "add" ? "👀" : "");
  } catch {
    // best-effort only
  }
}
