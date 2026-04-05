import { protocol, run, type RunItem } from "@openai/agents";
import type { HoomanContainer } from "../cli/container.js";
import type { AgentContainer } from "./container.js";
import type { Channel, ChannelMessage } from "../channels/types.js";
import { buildRunModelInput } from "./multimodal-input.js";
import {
  ApprovalsManager,
  type McpApprovalPrompt,
} from "../store/allowance.js";
import { read as readConfig } from "../store/agent-config.js";
import {
  createRecollectSession,
  type RecollectSession,
} from "./memory/recollect-session.js";
import { assistantOutputSkipsUserDelivery } from "./response-skip.js";
import { resolvedReasoningEnabled } from "./settings.js";
import { resolvedAgentTimeouts, resolvedMaxTurns } from "./timeouts.js";

const TOOL_ARGS_PREVIEW_MAX = 220;
const TOOL_RESULT_PREVIEW_MAX = 180;

/** Rough output-token estimate for live tok/s (API does not stream per-chunk usage). */
const STREAM_TPS_CHARS_PER_TOKEN_EST = 4;
const STREAM_TPS_MIN_ELAPSED_MS = 280;

function truncatePreview(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) {
    return t;
  }
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

function formatToolOutput(output: unknown): string {
  if (typeof output === "string") {
    return output;
  }
  if (output === undefined || output === null) {
    return "";
  }
  try {
    return JSON.stringify(output);
  } catch {
    return String(output);
  }
}

export type ToolCallStartInfo = {
  readonly callId: string;
  readonly name: string;
  readonly argsPreview: string;
};

export type ToolCallEndInfo = {
  readonly callId: string;
  readonly resultPreview: string;
};

function extractToolCallStart(item: RunItem): ToolCallStartInfo | null {
  if (item.type !== "tool_call_item") {
    return null;
  }
  const r = item.rawItem;
  switch (r.type) {
    case "function_call":
      return {
        callId: r.callId,
        name: r.name,
        argsPreview: truncatePreview(r.arguments ?? "", TOOL_ARGS_PREVIEW_MAX),
      };
    case "hosted_tool_call": {
      const id = r.id?.trim() ? r.id : `hosted:${r.name}`;
      return {
        callId: id,
        name: r.name,
        argsPreview: truncatePreview(r.arguments ?? "", TOOL_ARGS_PREVIEW_MAX),
      };
    }
    case "shell_call":
      return {
        callId: r.callId,
        name: "shell",
        argsPreview: truncatePreview(
          JSON.stringify(r.action),
          TOOL_ARGS_PREVIEW_MAX,
        ),
      };
    case "apply_patch_call":
      return {
        callId: r.callId,
        name: "apply_patch",
        argsPreview: truncatePreview(
          JSON.stringify(r.operation),
          TOOL_ARGS_PREVIEW_MAX,
        ),
      };
    case "computer_call":
      return {
        callId: r.callId,
        name: "computer_use",
        argsPreview: truncatePreview(
          JSON.stringify(r.action ?? r.actions ?? {}),
          TOOL_ARGS_PREVIEW_MAX,
        ),
      };
    default:
      return null;
  }
}

function extractToolOutputEnd(item: RunItem): ToolCallEndInfo | null {
  if (item.type !== "tool_call_output_item") {
    return null;
  }
  const r = item.rawItem;
  const outStr = formatToolOutput(item.output);
  switch (r.type) {
    case "function_call_result":
    case "shell_call_output":
    case "apply_patch_call_output":
    case "computer_call_result":
      return {
        callId: r.callId,
        resultPreview: truncatePreview(outStr, TOOL_RESULT_PREVIEW_MAX),
      };
    default:
      return null;
  }
}

function formatFinalOutput(final: unknown): string {
  if (final === undefined || final === null) {
    return "";
  }
  if (typeof final === "string") {
    return final;
  }
  return JSON.stringify(final);
}

async function streamAssistantTextDelta(
  channel: Channel | undefined,
  accumulated: string,
  onTextUpdate?: (text: string) => void,
): Promise<void> {
  if (channel) {
    if (channel.supportsStreaming !== false) {
      await channel.sendMessage(accumulated);
    }
    return;
  }
  onTextUpdate?.(accumulated);
}

async function sendAssistantTextFinal(
  channel: Channel | undefined,
  text: string,
  onTextUpdate?: (t: string) => void,
): Promise<void> {
  if (channel) {
    await channel.sendMessage(text);
    return;
  }
  onTextUpdate?.(text);
}

async function notifyToolCallStart(
  channel: Channel | undefined,
  info: ToolCallStartInfo,
  onToolCallStart?: (i: ToolCallStartInfo) => void,
): Promise<void> {
  if (channel?.sendToolCall) {
    await channel.sendToolCall(info);
    return;
  }
  if (!channel) {
    onToolCallStart?.(info);
  }
}

async function notifyToolCallEnd(
  channel: Channel | undefined,
  info: ToolCallEndInfo,
  onToolCallEnd?: (i: ToolCallEndInfo) => void,
): Promise<void> {
  if (channel?.sendToolResult) {
    await channel.sendToolResult(info);
    return;
  }
  if (!channel) {
    onToolCallEnd?.(info);
  }
}

/** Delta from OpenAI Responses, AI SDK stream parts (Ollama/Anthropic/etc.), or chat-completions. */
function extractReasoningDeltaFromRawModelStream(ev: {
  readonly type: string;
  readonly data: { readonly type: string; readonly event?: unknown };
}): string | null {
  if (ev.type !== "raw_model_stream_event") {
    return null;
  }
  const { data } = ev;
  if (
    data.type !== "model" ||
    data.event == null ||
    typeof data.event !== "object"
  ) {
    return null;
  }
  const e = data.event as {
    type?: string;
    delta?: unknown;
    choices?: Array<{ delta?: Record<string, unknown> }>;
  };
  if (
    e.type === "reasoning-delta" &&
    typeof e.delta === "string" &&
    e.delta.length > 0
  ) {
    return e.delta;
  }
  if (
    (e.type === "response.reasoning_text.delta" ||
      e.type === "response.reasoning_summary_text.delta") &&
    typeof e.delta === "string" &&
    e.delta.length > 0
  ) {
    return e.delta;
  }
  const choice = e.choices?.[0]?.delta;
  if (choice && typeof choice === "object" && "reasoning" in choice) {
    const r = choice.reasoning;
    if (typeof r === "string" && r.length > 0) {
      return r;
    }
  }
  return null;
}

export type OpenAgentSession = {
  readonly agentId: string;
  readonly agentContainer: AgentContainer;
  /** Recollect-backed persistence; implements {@link Session} for `run`. */
  readonly session: RecollectSession;
  readonly closeMcp: () => Promise<void>;
};

/**
 * Opens a long-lived agent + in-memory session. Reuse the same instance for each user message
 * until {@link OpenAgentSession.closeMcp} is called.
 */
export async function openAgentSession(
  container: HoomanContainer,
  agentId: string,
  options?: {
    channel?: Channel;
    mcpApprovalPrompt?: McpApprovalPrompt;
    sessionId?: string;
  },
): Promise<OpenAgentSession> {
  const id = agentId.toUpperCase();
  const cfg = await readConfig(id);
  const recollectSession = await createRecollectSession(
    id,
    cfg,
    container.llmRegistry,
    options?.sessionId,
  );
  const approvals = await ApprovalsManager.open(id);

  // If a channel is provided, we use its askApproval for tool approvals
  const approvalPrompt: McpApprovalPrompt | null = options?.channel
    ? async (info) =>
        options.channel!.askApproval(info.toolName, JSON.stringify(info.input))
    : (options?.mcpApprovalPrompt ?? null);

  approvals.setPromptHandler(approvalPrompt);
  const cliWorkingDirectory =
    options?.channel?.type === "cli" ? process.cwd() : undefined;

  const { container: agentContainer, closeMcp: innerClose } =
    await container.create(id, {
      approvals,
      ...(cliWorkingDirectory !== undefined ? { cliWorkingDirectory } : {}),
    });
  return {
    agentId: id,
    agentContainer,
    session: recollectSession,
    closeMcp: async () => {
      await recollectSession.dispose();
      await innerClose();
    },
  };
}

/**
 * Runs one user turn using the SDK streaming path (`stream: true`); text deltas are forwarded as
 * they arrive. If the stream emits no text (e.g. tools only), the final formatted output is used.
 * History is kept on {@link OpenAgentSession.session}.
 *
 * `prompt` may be a plain string (CLI) or a {@link ChannelMessage}; structured messages become
 * `### Channel message context` JSON plus the user `text`, and skip duplicate {@link Channel.getMetadata}
 * prepending.
 *
 * If the model output contains `[response:skip]`, nothing is sent to the channel/CLI for that turn
 * (empty string clears streaming CLI); the resolved return value is `""`.
 */
export type TurnUsageSnapshot = {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  readonly requests: number;
};

export async function runAgentSessionTurnStreaming(
  open: OpenAgentSession,
  prompt: string | ChannelMessage,
  channel?: Channel,
  options?: {
    readonly onTurnComplete?: (usage: TurnUsageSnapshot) => void;
    /** Used when there is no {@link Channel} or it has no {@link Channel.sendReasoningUpdate}. */
    readonly onReasoningUpdate?: (reasoningSoFar: string) => void;
    readonly onStreamingOutputTpsEst?: (tokensPerSec: number | null) => void;
    readonly abortSignal?: AbortSignal;
    /** Legacy callbacks: use channel instead if available */
    readonly onTextUpdate?: (text: string) => void;
    readonly onToolCallStart?: (info: ToolCallStartInfo) => void;
    readonly onToolCallEnd?: (info: ToolCallEndInfo) => void;
  },
): Promise<string> {
  const cfg = await readConfig(open.agentId);
  const input = await buildRunModelInput(prompt, channel, cfg);

  const agent = await open.agentContainer.value();
  const timeouts = resolvedAgentTimeouts(cfg);
  const maxTurns = resolvedMaxTurns(cfg);
  const streamReasoning = resolvedReasoningEnabled(cfg);

  const timeoutSignal = AbortSignal.timeout(timeouts.turnTimeoutMs);
  const signal = options?.abortSignal
    ? AbortSignal.any([timeoutSignal, options.abortSignal])
    : timeoutSignal;

  const streamed = await run(agent, input, {
    session: open.session,
    stream: true,
    maxTurns,
    signal,
  });

  let accumulated = "";
  let reasoningAccum = "";
  let firstOutputTextAtMs: number | null = null;

  const emitReasoning = async (text: string): Promise<void> => {
    if (channel && typeof channel.sendReasoningUpdate === "function") {
      await channel.sendReasoningUpdate(text);
    } else if (!channel) {
      options?.onReasoningUpdate?.(text);
    }
  };

  const clearReasoningUi = async (): Promise<void> => {
    if (reasoningAccum.length > 0) {
      reasoningAccum = "";
      await emitReasoning("");
    }
  };

  if (channel && typeof channel.setProcessingIndicator === "function") {
    await channel.setProcessingIndicator("add");
  }

  try {
    for await (const ev of streamed) {
      if (ev.type === "raw_model_stream_event") {
        const rd = streamReasoning
          ? extractReasoningDeltaFromRawModelStream(ev)
          : null;
        if (rd) {
          reasoningAccum += rd;
          await emitReasoning(reasoningAccum);
        }
        if (ev.data.type === "output_text_delta") {
          const parsed = protocol.StreamEventTextStream.parse(ev.data);
          if (streamReasoning && parsed.delta.length > 0) {
            await clearReasoningUi();
          }
          accumulated += parsed.delta;
          const now = Date.now();
          if (firstOutputTextAtMs === null) {
            firstOutputTextAtMs = now;
          }
          const elapsed = now - firstOutputTextAtMs;
          if (elapsed >= STREAM_TPS_MIN_ELAPSED_MS && accumulated.length > 0) {
            const estTok = Math.ceil(
              accumulated.length / STREAM_TPS_CHARS_PER_TOKEN_EST,
            );
            const sec = elapsed / 1000;
            options?.onStreamingOutputTpsEst?.(estTok / Math.max(sec, 1e-6));
          }

          await streamAssistantTextDelta(
            channel,
            accumulated,
            options?.onTextUpdate,
          );
        }
      } else if (ev.type === "run_item_stream_event") {
        if (ev.name === "tool_called") {
          const info = extractToolCallStart(ev.item);
          if (info) {
            await notifyToolCallStart(channel, info, options?.onToolCallStart);
          }
        } else if (ev.name === "tool_output") {
          const info = extractToolOutputEnd(ev.item);
          if (info) {
            await notifyToolCallEnd(channel, info, options?.onToolCallEnd);
          }
        }
      }
    }
    await streamed.completed;

    const u = streamed.runContext.usage;
    options?.onTurnComplete?.({
      inputTokens: u.inputTokens,
      outputTokens: u.outputTokens,
      totalTokens: u.totalTokens,
      requests: u.requests,
    });
    const finalFormatted = formatFinalOutput(streamed.finalOutput);
    const out = accumulated.length > 0 ? accumulated : finalFormatted;

    if (assistantOutputSkipsUserDelivery(out)) {
      if (channel) {
        if (channel.supportsStreaming !== false) {
          await channel.sendMessage("");
        }
      } else {
        options?.onTextUpdate?.("");
      }
      return "";
    }

    await sendAssistantTextFinal(channel, out, options?.onTextUpdate);
    return out;
  } finally {
    if (channel && typeof channel.setProcessingIndicator === "function") {
      try {
        await channel.setProcessingIndicator("remove");
      } catch {
        /* best-effort */
      }
    }
    void emitReasoning("");
    options?.onStreamingOutputTpsEst?.(null);
  }
}
