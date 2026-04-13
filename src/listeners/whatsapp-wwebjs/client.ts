import { homedir } from "node:os";
import { join } from "node:path";
import type { ApprovalService } from "../../core/approval-service";
import type { IdAllowlist } from "../../core/allowlist";
import type { CoreOrchestrator } from "../../core/orchestrator";
import type { SessionRegistry } from "../../core/session-registry";
import { isAllowedByAllowlist } from "../../core/allowlist";
import { log } from "../../core/logger";
import { parseUserControlCommand } from "../../core/stop-command";
import {
  buildWwebjsPlatformPrompt,
  toWwebjsConversationKey,
} from "./build-prompt";
import {
  resolveApprovalFromText,
  type WwebjsPendingApproval,
} from "./approvals";
import { WwebjsReplies } from "./replies";

type WwebjsRuntimeConfig = {
  session_path?: string;
  client_id?: string;
  puppeteer_executable_path?: string;
};

type WwebjsMessage = {
  id?: { _serialized?: string };
  from?: string;
  body?: string;
  fromMe?: boolean;
  react?: (emoji: string) => Promise<void>;
};

type WwebjsClient = {
  on: (event: string, cb: (...args: unknown[]) => void) => void;
  initialize: () => Promise<void>;
  sendMessage: (chatId: string, text: string) => Promise<unknown>;
  destroy?: () => Promise<void>;
};

export class WhatsAppWwebjsListener {
  private client: WwebjsClient | undefined;
  private replies: WwebjsReplies | undefined;
  private readonly pendingByChatId = new Map<string, WwebjsPendingApproval>();

  constructor(
    private readonly input: {
      config: WwebjsRuntimeConfig;
      allowlist: IdAllowlist;
      stopCommands: string[];
      orchestrator: CoreOrchestrator;
      approvals: ApprovalService;
      sessions: SessionRegistry;
    },
  ) {}

  async start(): Promise<void> {
    const mod = (await import("whatsapp-web.js")) as {
      Client: new (args: Record<string, unknown>) => WwebjsClient;
      LocalAuth: new (args: Record<string, unknown>) => unknown;
    };

    const authRoot = join(
      homedir(),
      ".hooman",
      "wwebjs",
      this.input.config.session_path ?? "default",
    );
    const client = new mod.Client({
      authStrategy: new mod.LocalAuth({
        clientId: this.input.config.client_id ?? "default",
        dataPath: authRoot,
      }),
      ...(this.input.config.puppeteer_executable_path
        ? {
            puppeteer: {
              executablePath: this.input.config.puppeteer_executable_path,
            },
          }
        : {}),
    });
    this.client = client;
    this.replies = new WwebjsReplies(client);

    this.input.approvals.subscribe(async (request) => {
      const binding = this.input.sessions.getBySessionId(request.sessionId);
      if (
        !binding ||
        binding.replyTarget.platform !== "wwebjs" ||
        !this.replies
      ) {
        return;
      }
      this.pendingByChatId.set(binding.replyTarget.channelId, {
        requestId: request.requestId,
        options: request.options,
      });
      await this.replies.postApproval(binding.replyTarget, request);
    });

    client.on("qr", (qr: unknown) => {
      log("info", "wwebjs", "QR received; scan with WhatsApp to authenticate", {
        qr: String(qr).slice(0, 32),
      });
    });
    client.on("ready", () => {
      log("info", "wwebjs", "listener ready");
    });
    client.on("auth_failure", (message: unknown) => {
      log("error", "wwebjs", "auth failure", { message: String(message) });
    });
    client.on("disconnected", (reason: unknown) => {
      log("warn", "wwebjs", "client disconnected", { reason: String(reason) });
    });
    client.on("message_create", async (message: unknown) => {
      await this.handleMessage(
        message as WwebjsMessage & Record<string, unknown>,
      );
    });

    await client.initialize();
    log("info", "wwebjs", "listener started");
  }

  async stop(): Promise<void> {
    try {
      if (this.client?.destroy) {
        await this.client.destroy();
      }
      this.pendingByChatId.clear();
      log("info", "wwebjs", "listener stopped");
    } catch (error) {
      log("warn", "wwebjs", "failed to stop listener cleanly", {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.client = undefined;
      this.replies = undefined;
    }
  }

  private async handleMessage(
    message: WwebjsMessage & Record<string, unknown>,
  ): Promise<void> {
    if (message.fromMe) return;
    const chatId = message.from?.trim();
    if (!chatId) return;
    if (!isAllowedByAllowlist(chatId, this.input.allowlist)) {
      log("info", "wwebjs", "ignoring message from disallowed chat", {
        chatId,
      });
      return;
    }

    const bodyTrim = (message.body ?? "").trim();
    const control = parseUserControlCommand(bodyTrim, this.input.stopCommands);
    if (control === "cancel") {
      const key = toWwebjsConversationKey(chatId);
      const { cancelled } = await this.input.orchestrator.cancelInFlight(key);
      if (this.replies) {
        await this.replies.postText(
          { platform: "wwebjs", channelId: chatId },
          cancelled
            ? "Cancellation sent (in-flight work and pending approvals)."
            : "Nothing to cancel for this chat yet.",
        );
      }
      return;
    }
    if (control === "reset") {
      try {
        await this.input.orchestrator.resetConversation(
          toWwebjsConversationKey(chatId),
          { platform: "wwebjs", channelId: chatId },
        );
        if (this.replies) {
          await this.replies.postText(
            { platform: "wwebjs", channelId: chatId },
            "Started a fresh chat for this conversation.",
          );
        }
      } catch (error) {
        await this.replies?.postError(
          { platform: "wwebjs", channelId: chatId },
          error,
        );
      }
      return;
    }

    const pending = this.pendingByChatId.get(chatId);
    if (pending) {
      const resolved = resolveApprovalFromText(
        this.input.approvals,
        pending,
        message.body ?? "",
      );
      if (resolved) {
        this.pendingByChatId.delete(chatId);
        log("info", "wwebjs", "approval resolved via text reply", {
          chatId,
          requestId: pending.requestId,
        });
        if (this.client) {
          await this.client.sendMessage(chatId, "Approval received.");
        }
        return;
      }
    }

    const prompt = await buildWwebjsPlatformPrompt(message);
    if (!prompt || !this.replies) return;

    await setWwebjsProcessingReaction(message, "add");
    try {
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
    } finally {
      await setWwebjsProcessingReaction(message, "remove");
    }
  }
}

async function setWwebjsProcessingReaction(
  message: WwebjsMessage,
  action: "add" | "remove",
): Promise<void> {
  if (!message.react) {
    return;
  }
  try {
    await message.react(action === "add" ? "👀" : "");
  } catch {
    // best-effort only
  }
}
