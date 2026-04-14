import type { RuntimeListener } from "../contracts";
import type { AppConfig } from "../config";
import type { ApprovalService } from "../core/approval-service";
import type { CoreOrchestrator } from "../core/orchestrator";
import type { SessionRegistry } from "../core/session-registry";
import { SlackListener } from "./slack/client";
import { TelegramListener } from "./telegram/client";
import { WhatsAppListener } from "./whatsapp/client";

export type ListenerFactoryContext = {
  config: AppConfig;
  orchestrator: CoreOrchestrator;
  approvals: ApprovalService;
  sessions: SessionRegistry;
};

type NamedListenerFactory = {
  name: string;
  create: (ctx: ListenerFactoryContext) => RuntimeListener | undefined;
};

const LISTENER_FACTORIES: NamedListenerFactory[] = [
  {
    name: "slack",
    create: (ctx) => {
      if (
        !ctx.config.slack.enabled ||
        !ctx.config.slack.app_token ||
        !ctx.config.slack.bot_token
      ) {
        return undefined;
      }
      return new SlackListener({
        appToken: ctx.config.slack.app_token,
        botToken: ctx.config.slack.bot_token,
        allowlist: ctx.config.slack.allowlist,
        requireMention: ctx.config.slack.require_mention,
        orchestrator: ctx.orchestrator,
        approvals: ctx.approvals,
        sessions: ctx.sessions,
      });
    },
  },
  {
    name: "telegram",
    create: (ctx) => {
      if (!ctx.config.telegram.enabled || !ctx.config.telegram.bot_token) {
        return undefined;
      }
      return new TelegramListener({
        botToken: ctx.config.telegram.bot_token,
        allowlist: ctx.config.telegram.allowlist,
        requireMention: ctx.config.telegram.require_mention,
        orchestrator: ctx.orchestrator,
        approvals: ctx.approvals,
        sessions: ctx.sessions,
      });
    },
  },
  {
    name: "whatsapp",
    create: (ctx) => {
      if (!ctx.config.whatsapp.enabled) {
        return undefined;
      }
      return new WhatsAppListener({
        config: ctx.config.whatsapp,
        allowlist: ctx.config.whatsapp.allowlist,
        orchestrator: ctx.orchestrator,
        approvals: ctx.approvals,
        sessions: ctx.sessions,
      });
    },
  },
];

export function createEnabledListeners(
  ctx: ListenerFactoryContext,
): Array<{ name: string; listener: RuntimeListener }> {
  const listeners: Array<{ name: string; listener: RuntimeListener }> = [];
  for (const factory of LISTENER_FACTORIES) {
    const listener = factory.create(ctx);
    if (listener) {
      listeners.push({ name: factory.name, listener });
    }
  }
  return listeners;
}
