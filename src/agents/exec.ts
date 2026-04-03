import { protocol, run, type RunItem } from "@openai/agents";
import type { HoomanContainer } from "../cli/container.js";
import type { AgentContainer } from "./utils/container.js";
import { ApprovalsManager, type McpApprovalPrompt } from "./allowance.js";
import { read as readConfig } from "./config.js";
import {
  createRecollectSession,
  type RecollectSession,
} from "./recollect/recollect-session.js";
import { resolvedReasoningEnabled } from "./model-settings.js";
import { resolvedAgentTimeouts, resolvedMaxTurns } from "./timeouts.js";

const TOOL_ARGS_PREVIEW_MAX = 220;
const TOOL_RESULT_PREVIEW_MAX = 180;

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
  options?: { mcpApprovalPrompt?: McpApprovalPrompt },
): Promise<OpenAgentSession> {
  const id = agentId.toUpperCase();
  const cfg = await readConfig(id);
  const recollectSession = await createRecollectSession(
    id,
    cfg,
    container.llmRegistry,
  );
  const approvals = await ApprovalsManager.open(id);
  approvals.setPromptHandler(options?.mcpApprovalPrompt ?? null);
  const { container: agentContainer, closeMcp: innerClose } =
    await container.create(id, {
      approvals,
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
 */
export type TurnUsageSnapshot = {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  readonly requests: number;
};

export async function runAgentSessionTurnStreaming(
  open: OpenAgentSession,
  prompt: string,
  onTextUpdate: (text: string) => void,
  options?: {
    readonly onTurnComplete?: (usage: TurnUsageSnapshot) => void;
    readonly onToolCallStart?: (info: ToolCallStartInfo) => void;
    readonly onToolCallEnd?: (info: ToolCallEndInfo) => void;
    /** Live reasoning/thinking text while the model streams (e.g. OpenAI reasoning deltas). */
    readonly onReasoningUpdate?: (reasoningSoFar: string) => void;
  },
): Promise<string> {
  const input = prompt.trim();
  const agent = await open.agentContainer.value();
  const cfg = await readConfig(open.agentId);
  const timeouts = resolvedAgentTimeouts(cfg);
  const maxTurns = resolvedMaxTurns(cfg);
  const streamReasoning = resolvedReasoningEnabled(cfg);
  const streamed = await run(agent, input, {
    session: open.session,
    stream: true,
    maxTurns,
    signal: AbortSignal.timeout(timeouts.turnTimeoutMs),
  });

  let accumulated = "";
  let reasoningAccum = "";

  const clearReasoningUi = (): void => {
    if (reasoningAccum.length > 0) {
      reasoningAccum = "";
      options?.onReasoningUpdate?.("");
    }
  };

  try {
    for await (const ev of streamed) {
      if (ev.type === "raw_model_stream_event") {
        const rd = streamReasoning
          ? extractReasoningDeltaFromRawModelStream(ev)
          : null;
        if (rd) {
          reasoningAccum += rd;
          options?.onReasoningUpdate?.(reasoningAccum);
        }
        if (ev.data.type === "output_text_delta") {
          const parsed = protocol.StreamEventTextStream.parse(ev.data);
          if (streamReasoning && parsed.delta.length > 0) {
            clearReasoningUi();
          }
          accumulated += parsed.delta;
          onTextUpdate(accumulated);
        }
      } else if (ev.type === "run_item_stream_event") {
        if (ev.name === "tool_called") {
          const info = extractToolCallStart(ev.item);
          if (info) {
            options?.onToolCallStart?.(info);
          }
        } else if (ev.name === "tool_output") {
          const info = extractToolOutputEnd(ev.item);
          if (info) {
            options?.onToolCallEnd?.(info);
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
    onTextUpdate(out);
    return out;
  } finally {
    options?.onReasoningUpdate?.("");
  }
}
