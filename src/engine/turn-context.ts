import type { Channel, ChannelMessage } from "../channels/types.js";
import { isStructuredChannelMessage } from "../channels/types.js";

/**
 * Normalized “what the model sees this turn”: optional JSON context block (CLI metadata or
 * structured channel fields) plus user text. Headings match prior runner behavior.
 */
export type TurnContext = {
  readonly text: string;
  readonly contextJson: unknown | null;
  readonly contextHeading:
    | "### Channel context"
    | "### Channel message context"
    | null;
};

export function turnContextFromCliPrompt(
  prompt: string,
  metadata?: unknown,
): TurnContext {
  const trimmed = prompt.trim();
  if (metadata) {
    return {
      text: trimmed,
      contextJson: metadata,
      contextHeading: "### Channel context",
    };
  }
  return { text: trimmed, contextJson: null, contextHeading: null };
}

/** Structured channel fields for the model, excluding the utterance (`text`). */
function channelMessageMetaJson(msg: ChannelMessage): Record<string, unknown> {
  const { text: _omit, ...rest } = msg;
  return Object.fromEntries(
    Object.entries(rest as Record<string, unknown>).filter(
      ([, v]) => v !== undefined,
    ),
  );
}

export function turnContextFromChannelMessage(
  msg: ChannelMessage,
): TurnContext {
  const text =
    typeof msg.text === "string" && msg.text.trim().length > 0
      ? msg.text.trim()
      : "";

  const metaRecord = channelMessageMetaJson(msg);

  if (Object.keys(metaRecord).length === 0) {
    return { text, contextJson: null, contextHeading: null };
  }

  return {
    text,
    contextJson: metaRecord,
    contextHeading: "### Channel message context",
  };
}

export function formatTurnContextForModel(turn: TurnContext): string {
  const t = turn.text;
  if (!turn.contextHeading || turn.contextJson == null) {
    return t;
  }

  const header = `${turn.contextHeading}\n\n${JSON.stringify(turn.contextJson, null, 2)}`;
  if (!t) {
    return header;
  }
  return `${header}\n\n---\n\n${t}`;
}

/** Maps CLI string + optional {@link Channel.getMetadata} or structured {@link ChannelMessage}. */
export function turnContextFromPrompt(
  prompt: string | ChannelMessage,
  channel: Channel | undefined,
): TurnContext {
  if (!isStructuredChannelMessage(prompt)) {
    return turnContextFromCliPrompt(prompt, channel?.getMetadata?.());
  }
  return turnContextFromChannelMessage(prompt);
}

export function buildModelInputFromTurnContext(turn: TurnContext): string {
  return formatTurnContextForModel(turn);
}
