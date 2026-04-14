import type { ApprovalService } from "../../core/approval-service";
import type { CoreOrchestrator } from "../../core/orchestrator";
import type { SessionRegistry } from "../../core/session-registry";
import type { IdAllowlist } from "../../contracts";
import { log } from "../../core/logger";
import { whatsappSessionRoot } from "../../paths";
import { WhatsAppFormatter } from "./formatter";
import { buildWhatsAppLaunchOptions } from "./launch-options";
import {
  WhatsAppMessageController,
  type WhatsAppRuntimeConfig,
} from "./controller";
import { WhatsAppReplies } from "./replies";
import type { WhatsAppMessage } from "./build-prompt";

type WhatsAppClient = {
  on: (event: string, cb: (...args: unknown[]) => void) => void;
  initialize: () => Promise<void>;
  sendMessage: (chatId: string, text: string) => Promise<unknown>;
  destroy?: () => Promise<void>;
  info?: { wid?: { _serialized?: string } };
  getContactLidAndPhone: (
    userIds: string[],
  ) => Promise<{ lid: string; pn: string }[]>;
};

export class WhatsAppListener {
  private client: WhatsAppClient | undefined;
  private replies: WhatsAppReplies | undefined;
  private readonly controller: WhatsAppMessageController;
  private readonly requireMention: boolean;

  constructor(
    private readonly input: {
      config: WhatsAppRuntimeConfig;
      allowlist: IdAllowlist;
      orchestrator: CoreOrchestrator;
      approvals: ApprovalService;
      sessions: SessionRegistry;
    },
  ) {
    this.requireMention = Boolean(input.config.require_mention);
    this.controller = new WhatsAppMessageController(
      input.allowlist,
      this.requireMention,
      input.orchestrator,
      input.approvals,
      () => this.replies,
      () => this.client,
      input.sessions,
    );
  }

  async start(): Promise<void> {
    const mod = (await import("whatsapp-web.js")) as {
      Client: new (args: Record<string, unknown>) => WhatsAppClient;
      LocalAuth: new (args: Record<string, unknown>) => unknown;
    };

    const authRoot = whatsappSessionRoot(this.input.config.session_path);
    const client = new mod.Client({
      authStrategy: new mod.LocalAuth({
        clientId: this.input.config.client_id ?? "default",
        dataPath: authRoot,
      }),
      ...buildWhatsAppLaunchOptions(this.input.config),
    });
    this.client = client;
    this.replies = new WhatsAppReplies(client, new WhatsAppFormatter());

    client.on("qr", (qr: unknown) => {
      log.info("QR received; scan with WhatsApp to authenticate", {
        scope: "whatsapp",
        qr: String(qr).slice(0, 32),
      });
    });
    client.on("ready", async () => {
      log.info("listener ready", { scope: "whatsapp" });
      if (this.requireMention) {
        await this.resolveBotWids(client);
      }
    });
    client.on("auth_failure", (message: unknown) => {
      log.error("auth failure", {
        scope: "whatsapp",
        error: String(message),
      });
    });
    client.on("disconnected", (reason: unknown) => {
      log.warn("client disconnected", {
        scope: "whatsapp",
        reason: String(reason),
      });
    });
    client.on("message_create", async (message: unknown) => {
      await this.handleMessage(
        message as WhatsAppMessage & Record<string, unknown>,
      );
    });

    await client.initialize();
    log.info("listener started", { scope: "whatsapp" });
  }

  async stop(): Promise<void> {
    try {
      if (this.client?.destroy) {
        await this.client.destroy();
      }
      this.controller.clearState();
      log.info("listener stopped", { scope: "whatsapp" });
    } catch (error) {
      log.warn("failed to stop listener cleanly", {
        scope: "whatsapp",
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.client = undefined;
      this.replies = undefined;
    }
  }

  private async resolveBotWids(client: WhatsAppClient): Promise<void> {
    const serialized = client.info?.wid?._serialized?.trim();
    if (!serialized) {
      log.warn("client missing wid; require_mention will not filter", {
        scope: "whatsapp",
      });
      return;
    }
    const wids = [serialized];
    try {
      const results = await client.getContactLidAndPhone([serialized]);
      for (const entry of results) {
        const lid = entry.lid?.trim();
        if (lid && !wids.includes(lid)) {
          wids.push(lid);
        }
      }
    } catch (error) {
      log.warn("failed to resolve lid for bot wid", {
        scope: "whatsapp",
        error: error instanceof Error ? error.message : String(error),
      });
    }
    this.controller.setBotWids(wids);
    log.info("resolved whatsapp bot wids for mention gate", {
      scope: "whatsapp",
      wids,
    });
  }

  private async handleMessage(
    message: WhatsAppMessage & Record<string, unknown>,
  ): Promise<void> {
    await this.controller.handleMessage(message);
  }
}
