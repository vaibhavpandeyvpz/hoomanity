import type { HoomanContainer } from "../cli/container.js";
import { formatCliErrorBrief } from "../cli/error-format.js";
import {
  type BotMemoryMode,
  botSessionIdForInbound,
} from "../engine/memory/session-ids.js";
import {
  openAgentSession,
  runAgentSessionTurnStreaming,
  type OpenAgentSession,
} from "../engine/runner.js";
import { log } from "../logging/app-logger.js";
import { channelConversationId } from "./inbound-queue.js";
import type { BotChannelType } from "./registry.js";
import type { Channel, ChannelMessage } from "./types.js";

export type BotInboundTurnLogFn = (msg: string, isError?: boolean) => void;

/**
 * After debounce merge: resolve session id, open {@link OpenAgentSession} if needed, run one streaming turn.
 * Reusable for any host that uses the same debounced queue + per-session MCP (not only {@link BotStatusScreen}).
 */
export async function runMergedBotInboundTurn(args: {
  readonly container: HoomanContainer;
  readonly agentId: string;
  readonly channelType: BotChannelType;
  readonly channel: Channel;
  /** Live session map (e.g. `sessionsRef.current`). */
  readonly sessions: Map<string, OpenAgentSession>;
  readonly merged: ChannelMessage;
  readonly addLog: BotInboundTurnLogFn;
  /** `single` = one shared memory; `multi` = separate session per conversation. */
  readonly botMemoryMode: BotMemoryMode;
}): Promise<void> {
  const {
    container,
    agentId,
    channelType,
    channel,
    sessions,
    merged,
    addLog,
    botMemoryMode,
  } = args;

  const cid = channelConversationId(merged);
  const sid = botSessionIdForInbound(merged, botMemoryMode);
  if (!sid) {
    const summary = "Error: missing channel id for session routing";
    addLog(summary, true);
    log.error(`[bot:${channelType}] ${summary}`);
    return;
  }

  try {
    let open = sessions.get(sid);
    if (!open) {
      open = await openAgentSession(container, agentId, {
        channel,
        sessionId: sid,
      });
      sessions.set(sid, open);
    }
    await runAgentSessionTurnStreaming(open, merged, channel);
  } catch (err: unknown) {
    const open = sessions.get(sid);
    if (open) {
      sessions.delete(sid);
      void open.closeMcp().catch(() => {});
    }
    const errChat = cid ? ` chat=${cid}` : "";
    const summary = `Error running turn${errChat}: ${formatCliErrorBrief(err)}`;
    addLog(summary, true);
    log.error(`[bot:${channelType}] ${summary}`, err);
  }
}
