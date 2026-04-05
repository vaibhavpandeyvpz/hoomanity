import { createHash } from "node:crypto";
import type { ChannelMessage } from "../../channels/types.js";

function md5SessionKey(preimage: string): string {
  return createHash("md5").update(preimage, "utf8").digest("hex");
}

/** Deterministic Recollect session id: `md5("whatsapp" + chatId)`. */
export function sessionIdForWhatsApp(chatId: string): string {
  const c = chatId.trim();
  if (!c) {
    throw new Error("sessionIdForWhatsApp: empty chatId");
  }
  return md5SessionKey(`whatsapp${c}`);
}

/** Deterministic Recollect session id: `md5("slack" + channelId)`. */
export function sessionIdForSlackChannel(channelId: string): string {
  const c = channelId.trim();
  if (!c) {
    throw new Error("sessionIdForSlackChannel: empty channelId");
  }
  return md5SessionKey(`slack${c}`);
}

/** Default CLI conversation: `md5("cli" + "main")`. */
export function sessionIdForCliMain(): string {
  return md5SessionKey(`cli${"main"}`);
}

/** One shared Recollect session for all bot conversations in this process (Slack and/or WhatsApp). */
export function sessionIdForBotMain(): string {
  return md5SessionKey(`bot${"main"}`);
}

export type BotMemoryMode = "single" | "multi";

export function botSessionIdFromChannelMessage(
  msg: ChannelMessage,
): string | null {
  switch (msg.channel) {
    case "slack": {
      const id = msg.channelId?.trim();
      return id ? sessionIdForSlackChannel(id) : null;
    }
    case "whatsapp": {
      const id = msg.chatId?.trim();
      return id ? sessionIdForWhatsApp(id) : null;
    }
    default: {
      const _exhaustive: never = msg;
      return _exhaustive;
    }
  }
}

/** Resolves Recollect session id for an inbound bot message. */
export function botSessionIdForInbound(
  msg: ChannelMessage,
  mode: BotMemoryMode,
): string | null {
  if (mode === "single") {
    return sessionIdForBotMain();
  }
  return botSessionIdFromChannelMessage(msg);
}
