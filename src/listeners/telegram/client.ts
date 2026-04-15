import { Telegraf, type Context } from "telegraf";
import type { ApprovalService } from "../../core/approval-service";
import type { CoreOrchestrator } from "../../core/orchestrator";
import type { SessionRegistry } from "../../core/session-registry";
import type { IdAllowlist } from "../../contracts";
import { log } from "../../core/logger";
import {
  TelegramMessageController,
  type TelegramCallbackQuery,
} from "./controller";
import { TelegramFormatter } from "./formatter";
import { TelegramReplies } from "./replies";
import type { TelegramInboundMessage } from "./build-prompt";

export class TelegramListener {
  private readonly bot: Telegraf;
  private readonly replies: TelegramReplies;
  private readonly controller: TelegramMessageController;
  private readonly requireMention: boolean;

  constructor(input: {
    botToken: string;
    allowlist: IdAllowlist;
    requireMention: boolean;
    orchestrator: CoreOrchestrator;
    approvals: ApprovalService;
    sessions: SessionRegistry;
  }) {
    this.requireMention = input.requireMention;
    this.bot = new Telegraf(input.botToken);
    this.replies = new TelegramReplies(
      this.bot.telegram,
      new TelegramFormatter(),
    );
    this.controller = new TelegramMessageController(
      input.allowlist,
      input.requireMention,
      input.orchestrator,
      () => this.replies,
      () => this.bot.telegram,
      input.approvals,
      input.sessions,
    );

    this.bot.on("message", (ctx: Context) => {
      void this.controller
        .handleMessage(ctx.message as TelegramInboundMessage)
        .catch((error: unknown) => {
          log.error("message handling failed", {
            scope: "telegram",
            error: error instanceof Error ? error.message : String(error),
          });
        });
    });

    this.bot.action(/^ap:/, async (ctx: Context) => {
      const query = ctx.callbackQuery as
        | (TelegramCallbackQuery & { data?: string })
        | undefined;
      log.info("approval callback received", {
        scope: "telegram",
        data: query?.data,
      });
      if (ctx.callbackQuery && "id" in ctx.callbackQuery) {
        void ctx.answerCbQuery().catch((error: unknown) => {
          log.warn("failed to acknowledge callback query", {
            scope: "telegram",
            error: error instanceof Error ? error.message : String(error),
          });
        });
      }
      void this.controller
        .handleCallbackQuery(query ?? {})
        .then((handled) => {
          log.info("approval callback processed", {
            scope: "telegram",
            data: query?.data,
            handled,
          });
        })
        .catch((error: unknown) => {
          log.error("callback query handling failed", {
            scope: "telegram",
            data: query?.data,
            error: error instanceof Error ? error.message : String(error),
          });
        });
    });

    this.bot.catch((error) => {
      log.error("listener error", {
        scope: "telegram",
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  async start(): Promise<void> {
    const me = await this.bot.telegram.getMe();
    this.controller.setBotIdentity({
      id: me.id,
      username: me.username ?? undefined,
    });
    log.info("resolved telegram bot identity", {
      scope: "telegram",
      botId: me.id,
      hasUsername: Boolean(me.username),
    });
    await this.bot.launch({
      allowedUpdates: ["message", "callback_query"],
    });
    log.info("listener started", { scope: "telegram" });
  }

  async stop(): Promise<void> {
    try {
      this.bot.stop("shutdown");
      this.controller.clearState();
      log.info("listener stopped", { scope: "telegram" });
    } catch (error) {
      log.warn("failed to stop listener cleanly", {
        scope: "telegram",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
