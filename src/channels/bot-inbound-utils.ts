import { channelConversationId } from "./inbound-queue.js";
import type { ChannelMessage } from "./types.js";

const TEXT_PREVIEW_MAX = 50;

/**
 * One-line log text for bot TUI when an inbound {@link ChannelMessage} arrives (before debounce).
 */
export function formatBotInboundLogLine(msg: ChannelMessage): string {
  const convId = channelConversationId(msg);
  const t = msg.text ?? "";
  const preview =
    t.length > TEXT_PREVIEW_MAX ? `${t.slice(0, TEXT_PREVIEW_MAX)}...` : t;
  const prefix = convId ? `Received chat=${convId}: ` : "Received: ";
  return `${prefix}${preview}`;
}
