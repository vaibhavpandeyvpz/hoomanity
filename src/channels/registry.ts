import { createAiSdkTextModel } from "../providers/factory.js";
import type { LlmProviderRegistry } from "../providers/registry.js";
import type { AgentConfig } from "../store/types.js";
import type { AiSdkTextModel } from "../providers/types.js";
import { SlackChannel } from "./slack-channel.js";
import { WhatsAppChannel } from "./whatsapp-channel.js";
import type { Channel, ChannelType } from "./types.js";
import { resolvedInboundAttachmentsMaxBytes } from "../engine/agent-limits.js";
import { InboundAttachmentSessionContext } from "./inbound-attachments.js";

/**
 * New bot channel checklist: extend {@link ChannelType} and shapes in `channel-messages.ts`
 * ({@link ChannelMessage}), add a row to
 * {@link botChannelFactories} (accept shared {@link InboundAttachmentSessionContext} from
 * {@link createBotChannel}), update {@link debounceKeyForMessage} / {@link debounceMsForMessage} /
 * {@link mergeChannelMessageBatch} in `merge-inbound-batch.ts`, debounce helpers in `inbound-queue.ts`,
 * Slack inbound parsing in `slack-inbound-shapes.ts`, WhatsApp helpers in
 * `whatsapp-inbound-shapes.ts`, mention batch merge in `mentions.ts`, bot debounced turn in
 * `bot-debounced-turn.ts` (brief turn errors via `formatCliErrorBrief` in `cli/error-format.js`), optional approval prompt in
 * `approval-llm.ts`, and configure UI in `ChannelsScreen`.
 */

/** Non-interactive channels driven from {@link BotStatusScreen}. */
export const BOT_CHANNEL_TYPES = [
  "slack",
  "whatsapp",
] as const satisfies readonly Exclude<ChannelType, "cli">[];

export type BotChannelType = (typeof BOT_CHANNEL_TYPES)[number];

export const BOT_CHANNEL_LABELS: Record<BotChannelType, string> = {
  slack: "Slack",
  whatsapp: "WhatsApp",
};

export function isBotChannelType(t: ChannelType): t is BotChannelType {
  return t === "slack" || t === "whatsapp";
}

export function botChannelHumanLabel(type: BotChannelType): string {
  return BOT_CHANNEL_LABELS[type];
}

export type CreateBotChannelArgs = {
  readonly channelType: BotChannelType;
  readonly agentId: string;
  readonly cfg: AgentConfig;
  readonly llmRegistry: LlmProviderRegistry;
};

type BotChannelFactory = (
  approvalModel: AiSdkTextModel,
  agentId: string,
  cfg: AgentConfig,
  inboundFiles: InboundAttachmentSessionContext,
) => Channel;

const botChannelFactories: Record<BotChannelType, BotChannelFactory> = {
  slack(approvalModel, _agentId, cfg, inboundFiles) {
    if (!cfg.slack) {
      throw new Error("Slack configuration missing for this agent.");
    }
    const bot = cfg.slack.token?.trim() ?? "";
    const user = cfg.slack.userToken?.trim() ?? "";
    return new SlackChannel(approvalModel, {
      ...(bot ? { token: bot } : {}),
      signingSecret: cfg.slack.signingSecret,
      appToken: cfg.slack.appToken,
      userToken: user,
      inboundFiles,
    });
  },
  whatsapp(approvalModel, agentId, cfg, inboundFiles) {
    if (!cfg.whatsapp) {
      throw new Error("WhatsApp configuration missing for this agent.");
    }
    return new WhatsAppChannel(
      approvalModel,
      agentId,
      cfg.whatsapp.sessionName,
      inboundFiles,
    );
  },
};

/**
 * Construct a bot {@link Channel} from agent config. Throws if the channel is not configured.
 */
export function createBotChannel(args: CreateBotChannelArgs): Channel {
  const approvalModel = createAiSdkTextModel(args.llmRegistry, args.cfg);
  const inboundFiles = new InboundAttachmentSessionContext(
    args.agentId.toUpperCase(),
    resolvedInboundAttachmentsMaxBytes(args.cfg),
  );
  return botChannelFactories[args.channelType](
    approvalModel,
    args.agentId,
    args.cfg,
    inboundFiles,
  );
}
