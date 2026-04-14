import { parseUserControlCommand } from "../../core/stop-command";
import { combineSlackMessageText } from "./mapper";

type SlackMessageEvent = {
  type?: string;
  text?: string;
  bot_id?: string;
  subtype?: string;
  channel?: string;
  blocks?: unknown;
};

/**
 * `conversations.info` marks 1:1 DMs with `is_im`; other conversation types still
 * require an explicit @-mention when `requireMention` is enabled.
 */
export function slackConversationIsDirectMessage(channel?: {
  is_im?: boolean;
}): boolean {
  return channel?.is_im === true;
}

export function slackTextMentionsUser(text: string, userId: string): boolean {
  if (!userId.trim()) return false;
  return new RegExp(`<@${escapeRegExp(userId)}(?:\\|[^>]+)?>`).test(text);
}

/**
 * When {@link requireMention} is enabled, returns true if this Events API message
 * should be dropped before building a prompt (non-DM without an @-mention of the bot).
 * Control phrases (`cancel`, `reset chat`, …) bypass the mention rule.
 */
export async function slackEventsApiShouldIgnoreMissingMention(
  body: Record<string, unknown>,
  opts: {
    requireMention: boolean;
    botUserId?: string;
    resolveConversation?: (
      channelId: string,
    ) => Promise<{ is_im?: boolean } | undefined>;
  },
): Promise<boolean> {
  if (!opts.requireMention || !opts.botUserId?.trim()) {
    return false;
  }
  const event = body.event as SlackMessageEvent | undefined;
  if (!event || event.type !== "message") {
    return false;
  }
  if (typeof event.subtype === "string" || event.bot_id) {
    return false;
  }
  const raw = typeof event.text === "string" ? event.text : "";
  const combined = combineSlackMessageText(raw, event.blocks);
  if (parseUserControlCommand(combined)) {
    return false;
  }
  const channelId =
    typeof event.channel === "string" ? event.channel.trim() : "";
  if (!channelId || !opts.resolveConversation) {
    return false;
  }
  const channel = await opts.resolveConversation(channelId);
  if (!channel) {
    return false;
  }
  if (slackConversationIsDirectMessage(channel)) {
    return false;
  }
  return !slackTextMentionsUser(combined, opts.botUserId.trim());
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
