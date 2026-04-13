import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { homedir } from "node:os";
import type { ApprovalService } from "../../core/approval-service";
import type { IdAllowlist } from "../../core/allowlist";
import type { CoreOrchestrator } from "../../core/orchestrator";
import type { SessionRegistry } from "../../core/session-registry";
import type { StoredAttachment } from "../../core/types";
import { isAllowedByAllowlist } from "../../core/allowlist";
import { log } from "../../core/logger";
import { parseUserControlCommand } from "../../core/stop-command";
import {
  buildWhatsAppPlatformPrompt,
  extractWhatsAppText,
  mediaRefsFromWebhook,
  toWhatsAppConversationKey,
  type WhatsAppWebhookMessage,
} from "./build-prompt";
import { WhatsAppWebhookDeduper } from "./idempotency";
import { parseWhatsAppApprovalText, WhatsAppActions } from "./actions";
import { WhatsAppReplies } from "./replies";

type WhatsAppRuntimeConfig = {
  access_token?: string;
  phone_number_id?: string;
  verify_token?: string;
  app_secret?: string;
  webhook_port?: number;
  webhook_path?: string;
};

type WhatsAppWebhookPayload = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: WhatsAppWebhookMessage[];
      };
    }>;
  }>;
};

export class WhatsAppListener {
  private server: ReturnType<typeof Bun.serve> | undefined;
  private replies: WhatsAppReplies | undefined;
  private readonly actions: WhatsAppActions;
  private readonly pendingByChatId = new Map<string, string>();
  private readonly chatByRequestId = new Map<string, string>();
  private readonly webhookDeduper = new WhatsAppWebhookDeduper();

  constructor(
    private readonly input: {
      config: WhatsAppRuntimeConfig;
      allowlist: IdAllowlist;
      stopCommands: string[];
      orchestrator: CoreOrchestrator;
      approvals: ApprovalService;
      sessions: SessionRegistry;
    },
  ) {
    this.actions = new WhatsAppActions(input.approvals);

    input.approvals.subscribe(async (request) => {
      const binding = this.input.sessions.getBySessionId(request.sessionId);
      if (!binding || binding.replyTarget.platform !== "whatsapp") {
        return;
      }
      const chatId = binding.replyTarget.channelId;
      this.pendingByChatId.set(chatId, request.requestId);
      this.chatByRequestId.set(request.requestId, chatId);
      await this.replies?.postApproval(binding.replyTarget, request);
    });
  }

  async start(): Promise<void> {
    const accessToken = this.input.config.access_token?.trim();
    const phoneNumberId = this.input.config.phone_number_id?.trim();
    const verifyToken = this.input.config.verify_token?.trim();
    if (!accessToken || !phoneNumberId || !verifyToken) {
      throw new Error(
        "whatsapp listener requires access_token, phone_number_id, and verify_token.",
      );
    }
    this.replies = new WhatsAppReplies({
      access_token: accessToken,
      phone_number_id: phoneNumberId,
    });
    const path = this.input.config.webhook_path ?? "/whatsapp/webhook";
    const port = this.input.config.webhook_port ?? 8787;
    this.server = Bun.serve({
      port,
      fetch: async (request) => {
        const url = new URL(request.url);
        if (url.pathname !== path) {
          return new Response("Not found", { status: 404 });
        }
        if (request.method === "GET") {
          return this.handleVerification(url);
        }
        if (request.method === "POST") {
          return this.handleWebhook(request);
        }
        return new Response("Method not allowed", { status: 405 });
      },
    });
    log("info", "whatsapp", "official listener started", { port, path });
  }

  async stop(): Promise<void> {
    try {
      if (this.server) {
        this.server.stop(true);
      }
      this.server = undefined;
      this.pendingByChatId.clear();
      this.chatByRequestId.clear();
      log("info", "whatsapp", "official listener stopped");
    } catch (error) {
      log("warn", "whatsapp", "failed to stop official listener cleanly", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private handleVerification(url: URL): Response {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (
      mode === "subscribe" &&
      token === this.input.config.verify_token?.trim() &&
      challenge
    ) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("forbidden", { status: 403 });
  }

  private async handleWebhook(request: Request): Promise<Response> {
    let payload: WhatsAppWebhookPayload;
    try {
      payload = (await request.json()) as WhatsAppWebhookPayload;
    } catch {
      return new Response("bad request", { status: 400 });
    }

    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const messages = change.value?.messages ?? [];
        for (const message of messages) {
          await this.handleMessage(message);
        }
      }
    }

    return new Response("ok", { status: 200 });
  }

  private async handleMessage(message: WhatsAppWebhookMessage): Promise<void> {
    const chatId = message.from?.trim();
    if (!chatId) return;
    if (!this.webhookDeduper.shouldProcess(message.id)) {
      log("info", "whatsapp", "ignoring duplicate webhook delivery", {
        chatId,
        messageId: message.id,
      });
      return;
    }
    if (!isAllowedByAllowlist(chatId, this.input.allowlist)) {
      log("info", "whatsapp", "ignoring message from disallowed chat", {
        chatId,
      });
      return;
    }

    if (this.actions.resolveInteractive(message)) {
      const action = parseInteractiveId(message);
      if (action?.requestId) {
        this.clearPending(action.requestId);
      }
      return;
    }

    const plain = extractWhatsAppText(message);
    const control = parseUserControlCommand(plain, this.input.stopCommands);
    if (control === "cancel") {
      const key = toWhatsAppConversationKey(chatId);
      const { cancelled } = await this.input.orchestrator.cancelInFlight(key);
      await this.replies?.postText(
        { platform: "whatsapp", channelId: chatId },
        cancelled
          ? "Cancellation sent (in-flight work and pending approvals)."
          : "Nothing to cancel for this chat yet.",
      );
      return;
    }
    if (control === "reset") {
      try {
        await this.input.orchestrator.resetConversation(keyForChat(chatId), {
          platform: "whatsapp",
          channelId: chatId,
        });
        await this.replies?.postText(
          { platform: "whatsapp", channelId: chatId },
          "Started a fresh chat for this conversation.",
        );
      } catch (error) {
        await this.replies?.postError(
          { platform: "whatsapp", channelId: chatId },
          error,
        );
      }
      return;
    }

    const pendingRequestId = this.pendingByChatId.get(chatId);
    if (pendingRequestId && message.text?.body) {
      const intent = parseWhatsAppApprovalText(message.text.body);
      if (intent === "cancel") {
        const resolved =
          this.actions.resolveCancelByRequestId(pendingRequestId);
        if (resolved) {
          this.clearPending(pendingRequestId);
          await this.replies?.sendText(chatId, "Approval cancelled.");
          return;
        }
      }
    }

    const attachments = await this.downloadMessageAttachments(message);
    const prompt = buildWhatsAppPlatformPrompt(message, attachments);
    if (!prompt) return;

    const turn = await this.input.orchestrator.enqueuePrompt(prompt, {
      onCompleted: async (result) => {
        await this.replies?.postFinal(prompt.replyTarget, result);
      },
      onError: async (error) => {
        await this.replies?.postError(prompt.replyTarget, error);
      },
    });
    if (turn === undefined) {
      return;
    }
  }

  private async downloadMessageAttachments(
    message: WhatsAppWebhookMessage,
  ): Promise<StoredAttachment[]> {
    const accessToken = this.input.config.access_token?.trim();
    if (!accessToken) return [];
    const refs = mediaRefsFromWebhook(message);
    if (refs.length === 0) return [];
    const out: StoredAttachment[] = [];
    for (const ref of refs) {
      try {
        const metaRes = await fetch(
          `https://graph.facebook.com/v20.0/${ref.mediaId}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          },
        );
        if (!metaRes.ok) continue;
        const meta = (await metaRes.json()) as { url?: string };
        if (!meta.url) continue;
        const fileRes = await fetch(meta.url, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
        if (!fileRes.ok) continue;
        const buffer = Buffer.from(await fileRes.arrayBuffer());
        const attachment = await saveAttachment(
          buffer,
          ref.originalName,
          ref.mimeType,
        );
        out.push(attachment);
      } catch (error) {
        log("warn", "whatsapp", "failed to download media attachment", {
          mediaId: ref.mediaId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return out;
  }

  private clearPending(requestId: string): void {
    const chat = this.chatByRequestId.get(requestId);
    if (chat) {
      this.pendingByChatId.delete(chat);
    }
    this.chatByRequestId.delete(requestId);
  }
}

async function saveAttachment(
  buffer: Buffer,
  originalName: string,
  mimeType: string,
): Promise<StoredAttachment> {
  const root = join(homedir(), ".hooman", "attachments");
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

function parseInteractiveId(
  message: WhatsAppWebhookMessage,
): { requestId?: string } | undefined {
  const id = message.interactive?.button_reply?.id;
  if (!id) return undefined;
  try {
    return JSON.parse(id) as { requestId?: string };
  } catch {
    return undefined;
  }
}

function keyForChat(chatId: string): string {
  return toWhatsAppConversationKey(chatId);
}
