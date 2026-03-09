/**
 * Chat event handler: message.sent → run agents, dispatch response.
 * Extracted from event-handlers.ts for clarity.
 */
import createDebug from "debug";
import type { NormalizedEvent } from "../types.js";
import type { ContextStore } from "../chats/context.js";
import type { AuditLog } from "../audit/audit.js";
import type {
  HoomanRunner,
  RunChatOptions,
  RunChatResult,
} from "../agents/hooman-runner.js";
import type { ModelMessage } from "ai";
import type { ChannelMeta, NormalizedMessagePayload } from "../types.js";
import type { PendingApproval } from "../approval/approval-store.js";
import {
  getPending,
  consumePending,
  clearPending,
  setPending,
  channelKeyFromMeta,
} from "../approval/approval-store.js";
import {
  formatApprovalMessageWithLlm,
  parseApprovalReplyWithLlm,
} from "../approval/approval-llm.js";
import { parseConfirmationReply } from "../approval/confirmation.js";
import type { ConfirmationResult } from "../approval/confirmation.js";
import { mcpResultToToolResultOutput } from "../capabilities/mcp/mcp-service.js";
import type { ToolSettingsStore } from "../capabilities/mcp/tool-settings-store.js";
import { getConfig } from "../config.js";
import {
  ChatTimeoutError,
  DEFAULT_CHAT_TIMEOUT_MS,
  type RunAgentFn,
  dispatchResponseToChannel as dispatch,
  formatApprovalMessage,
  approvalReplyLabelToResult,
} from "./chat-handler-shared.js";

const debug = createDebug("hooman:chat-handler");

interface ToolCallFullInfo {
  toolCallId: string;
  toolName: string;
  toolArgs: unknown;
}

/** Collect all tool calls from assistant messages (content parts with type tool-call). */
function collectToolCalls(thread: ModelMessage[]): ToolCallFullInfo[] {
  const out: ToolCallFullInfo[] = [];
  for (const msg of thread) {
    if (msg.role !== "assistant") continue;
    const content = msg.content;
    if (!Array.isArray(content)) continue;
    for (const part of content as Array<{
      type?: string;
      toolCallId?: string;
      id?: string;
      toolName?: string;
      name?: string;
      input?: unknown;
      args?: unknown;
    }>) {
      if (part?.type === "tool-call" || part?.type === "tool_call") {
        out.push({
          toolCallId: part.toolCallId ?? part.id ?? `call_${Date.now()}`,
          toolName: (part.toolName ?? part.name ?? "unknown") as string,
          toolArgs: part.input ?? part.args ?? {},
        });
      }
    }
  }
  return out;
}

/** Collect tool call IDs that already have results in the thread. */
function getToolCallIdsWithResults(thread: ModelMessage[]): Set<string> {
  const ids = new Set<string>();
  for (const msg of thread) {
    if (msg.role !== "tool") continue;
    const content = msg.content;
    if (!Array.isArray(content)) continue;
    for (const part of content as Array<{
      type?: string;
      toolCallId?: string;
    }>) {
      if (part?.type === "tool-result" && part.toolCallId)
        ids.add(part.toolCallId);
    }
  }
  return ids;
}

/** First tool call that doesn't have a result yet (next to ask approval for). */
function getNextToolCallNeedingApproval(
  thread: ModelMessage[],
): ToolCallFullInfo | null {
  const withResults = getToolCallIdsWithResults(thread);
  for (const tc of collectToolCalls(thread)) {
    if (!withResults.has(tc.toolCallId)) return tc;
  }
  return null;
}

export interface ChatHandlerDeps {
  context: ContextStore;
  auditLog: AuditLog;
  publishResponse: (
    payload: import("../types.js").ResponseDeliveryPayload,
  ) => void;
  getRunner: () => Promise<HoomanRunner>;
  runAgent: RunAgentFn;
  toolSettingsStore?: ToolSettingsStore;
  invalidateRunnerCache?: () => void;
}

export function createChatHandler(
  deps: ChatHandlerDeps,
): (event: NormalizedEvent) => Promise<void> {
  const { context, auditLog, publishResponse, runAgent } = deps;

  const dispatchResponse = (
    eventId: string,
    source: string,
    channelMeta: ChannelMeta | undefined,
    text: string,
    approvalRequest?: { toolName: string; argsPreview: string },
  ) =>
    dispatch(
      publishResponse,
      eventId,
      source,
      channelMeta,
      text,
      approvalRequest,
    );

  return async (event: NormalizedEvent) => {
    if (event.payload.kind !== "message") return;

    const { text, userId, attachmentContents, channelMeta, sourceMessageType } =
      event.payload;
    const channelKey = channelKeyFromMeta(
      channelMeta as ChannelMeta | undefined,
    );
    const runOptions: RunChatOptions = {
      channel: channelMeta as ChannelMeta | undefined,
      attachments: attachmentContents,
      sessionId: userId,
    };
    const chatTimeoutMs =
      getConfig().CHAT_TIMEOUT_MS || DEFAULT_CHAT_TIMEOUT_MS;

    await logIncomingMessage(
      auditLog,
      event,
      userId,
      text,
      channelMeta,
      sourceMessageType,
    );
    debug("Processing message eventId=%s userId=%s", event.id, userId);

    const payload = event.payload as NormalizedMessagePayload;
    const pending = await getPending(userId, channelKey);
    if (pending) {
      const handled = await handlePendingApproval(deps, {
        event,
        payload,
        channelKey,
        runOptions,
        chatTimeoutMs,
        pending,
        dispatchResponse,
      });
      if (handled) return;
    }

    try {
      const thread = await context.getThreadForAgent(userId);
      const result = await runAgent(thread, text, runOptions, chatTimeoutMs);

      if (result.needsApproval) {
        await handleNeedsApproval(deps, {
          event,
          payload,
          channelKey,
          runOptions,
          result,
          dispatchResponse,
        });
        return;
      }

      await handleAgentSuccess(deps, {
        event,
        payload,
        result,
        dispatchResponse,
      });
    } catch (err) {
      await handleChatError(deps, {
        event,
        payload,
        err,
        dispatchResponse,
      });
    }
  };
}

async function logIncomingMessage(
  auditLog: AuditLog,
  event: NormalizedEvent,
  userId: string,
  text: string,
  channelMeta: ChannelMeta | undefined,
  sourceMessageType?: "audio",
): Promise<void> {
  const textPreview = text.length > 100 ? `${text.slice(0, 100)}…` : text;
  await auditLog.appendAuditEntry({
    type: "incoming_message",
    payload: {
      source: event.source,
      userId,
      textPreview,
      channel: (channelMeta as { channel?: string } | undefined)?.channel,
      eventId: event.id,
      ...(sourceMessageType ? { sourceMessageType } : {}),
    },
  });
}

interface PendingApprovalCtx {
  event: NormalizedEvent;
  payload: NormalizedMessagePayload;
  channelKey: string | undefined;
  runOptions: RunChatOptions;
  chatTimeoutMs: number;
  pending: PendingApproval;
  dispatchResponse: (
    eventId: string,
    source: string,
    channelMeta: ChannelMeta | undefined,
    text: string,
    approvalRequest?: { toolName: string; argsPreview: string },
  ) => void | Promise<void>;
}

async function handlePendingApproval(
  deps: ChatHandlerDeps,
  ctx: PendingApprovalCtx,
): Promise<boolean> {
  const { event, payload, channelKey, pending, dispatchResponse } = ctx;
  const { auditLog } = deps;

  debug(
    "Pending approval found eventId=%s userId=%s toolName=%s",
    event.id,
    payload.userId,
    pending.toolName,
  );

  const reply = await parsePendingReply(payload.text, pending);
  if (reply === "reject") {
    const consumed = await consumePending(payload.userId, channelKey);
    debug(
      "Approval rejected eventId=%s userId=%s toolName=%s",
      event.id,
      payload.userId,
      pending.toolName,
    );
    await auditLog.appendAuditEntry({
      type: "approval_rejected",
      payload: {
        userId: payload.userId,
        eventId: event.id,
        toolName: pending.toolName,
      },
    });
    if (!consumed) {
      await dispatchResponse(
        event.id,
        event.source,
        ctx.runOptions.channel as ChannelMeta | undefined,
        "Approval expired. You can try again.",
      );
      return true;
    }
    await handleApprovalReject(deps, { ...ctx, consumed } as ApprovalRejectCtx);
    return true;
  }

  if (reply === "none") {
    debug(
      "Pending cleared (reply=none), treating as new message eventId=%s",
      event.id,
    );
    await clearPending(payload.userId, channelKey);
    return false;
  }

  if (reply === "confirm" || reply === "allow_every_time") {
    await handleApprovalConfirm(deps, ctx, reply);
    return true;
  }

  return false;
}

async function parsePendingReply(
  text: string,
  pending: PendingApproval,
): Promise<ConfirmationResult> {
  const toolApprovalMode = getConfig().TOOL_APPROVAL_MODE ?? "llm";
  if (toolApprovalMode === "llm") {
    try {
      const label = await parseApprovalReplyWithLlm(
        text,
        pending.toolName,
        pending.approvalMessage,
      );
      return approvalReplyLabelToResult(label);
    } catch {
      return "none";
    }
  }
  return parseConfirmationReply(text);
}

interface ApprovalRejectCtx extends PendingApprovalCtx {
  consumed: PendingApproval;
}

async function handleApprovalReject(
  deps: ChatHandlerDeps,
  ctx: ApprovalRejectCtx,
): Promise<void> {
  const {
    event,
    payload,
    channelKey,
    runOptions,
    chatTimeoutMs,
    consumed,
    dispatchResponse,
  } = ctx;
  const { context, runAgent } = deps;

  let thread: ModelMessage[];
  try {
    thread = JSON.parse(consumed.threadSnapshotJson) as ModelMessage[];
  } catch {
    thread = [];
  }
  const deniedToolCallId =
    (consumed as { toolCallId?: string }).toolCallId ?? `call_${Date.now()}`;
  const deniedOutput = mcpResultToToolResultOutput({
    content: [{ type: "text", text: "Execution denied by user." }],
  });
  const toolResultMessage = {
    role: "tool" as const,
    content: [
      {
        type: "tool-result" as const,
        toolCallId: deniedToolCallId,
        toolName: consumed.toolName,
        output: deniedOutput,
      },
    ],
  } as ModelMessage;
  thread.push(toolResultMessage);

  const nextTool = getNextToolCallNeedingApproval(thread);
  if (nextTool) {
    await requestApprovalForTool(deps, {
      event,
      payload,
      channelKey,
      runOptions,
      toolName: nextTool.toolName,
      toolArgs: nextTool.toolArgs,
      toolCallId: nextTool.toolCallId,
      thread,
      historyLength: consumed.historyLength,
      dispatchResponse,
    });
    return;
  }

  // All tools in this assistant message now have a result (approved or rejected). Run agent once to produce final response using all results.
  try {
    const result = await runAgent(
      thread,
      "User denied one or more tools. Use the tool results for any tools that were approved; for any that were denied, say the user declined that check.",
      runOptions,
      chatTimeoutMs,
    );

    if (result.needsApproval) {
      // We already persisted [user, assistant(tool calls)] in the first handleNeedsApproval.
      // Persist only tool results + "User denied." Do NOT persist the new assistant message.
      const histLen = consumed.historyLength ?? 0;
      const turnFromHistory =
        result.needsApproval.threadSnapshot.slice(histLen);
      const newMessagesOnly = turnFromHistory.slice(2, -1);
      if (newMessagesOnly.length) {
        await context.addTurnToAgentThread(
          payload.userId,
          newMessagesOnly as ModelMessage[],
        );
      }
      await handleNeedsApproval(deps, {
        event,
        payload,
        channelKey,
        runOptions,
        result,
        dispatchResponse,
      });
      return;
    }

    const assistantText = result.output?.trim() || "I didn't run that tool.";
    await context.addTurnToChatHistory(
      payload.userId,
      payload.text,
      assistantText,
      {
        userAttachments: payload.attachments,
      },
    );
    await dispatchResponse(
      event.id,
      event.source,
      runOptions.channel as ChannelMeta | undefined,
      assistantText,
    );

    // We already persisted [user, assistant(tool call)] in handleNeedsApproval.
    const historyLength = consumed.historyLength ?? 0;
    const turnFromHistory = thread.slice(historyLength);
    const toolResultsAndRun = [
      ...turnFromHistory.slice(2),
      ...(result.messages ?? []),
    ] as ModelMessage[];
    if (toolResultsAndRun.length) {
      await context.addTurnToAgentThread(payload.userId, toolResultsAndRun);
    } else {
      await context.addTurnToAgentThread(payload.userId, [
        { role: "user", content: payload.text },
        { role: "assistant", content: assistantText },
      ] as ModelMessage[]);
    }
  } catch (err) {
    const msg = (err as Error).message;
    const assistantText = `Something went wrong: ${msg}. Check API logs.`;
    await context.addTurnToChatHistory(
      payload.userId,
      payload.text,
      assistantText,
      {
        userAttachments: payload.attachments,
      },
    );
    await dispatchResponse(
      event.id,
      event.source,
      runOptions.channel as ChannelMeta | undefined,
      assistantText,
    );
  }
}

async function handleApprovalConfirm(
  deps: ChatHandlerDeps,
  ctx: PendingApprovalCtx,
  reply: "confirm" | "allow_every_time",
): Promise<void> {
  const {
    event,
    payload,
    channelKey,
    runOptions,
    chatTimeoutMs,
    dispatchResponse,
  } = ctx;
  const { context, auditLog, getRunner, runAgent } = deps;

  const consumed = await consumePending(payload.userId, channelKey);
  if (!consumed) {
    debug("Approval expired or already consumed eventId=%s", event.id);
    await dispatchResponse(
      event.id,
      event.source,
      runOptions.channel as ChannelMeta | undefined,
      "Approval expired. You can try again.",
    );
    return;
  }

  if (
    reply === "allow_every_time" &&
    deps.toolSettingsStore &&
    consumed.toolName
  ) {
    const toolId =
      (consumed as { toolId?: string }).toolId ?? consumed.toolName;
    await deps.toolSettingsStore.setAllowEveryTime(toolId, true);
    deps.invalidateRunnerCache?.();
    await auditLog.appendAuditEntry({
      type: "approval_allow_every_time",
      payload: { userId: payload.userId, toolId, toolName: consumed.toolName },
    });
  } else if (reply === "confirm") {
    await auditLog.appendAuditEntry({
      type: "approval_confirmed",
      payload: {
        userId: payload.userId,
        eventId: event.id,
        toolName: consumed.toolName,
      },
    });
  }

  debug(
    "Approval %s eventId=%s userId=%s toolName=%s",
    reply,
    event.id,
    payload.userId,
    consumed.toolName,
  );

  try {
    let thread: ModelMessage[];
    try {
      thread = JSON.parse(consumed.threadSnapshotJson) as ModelMessage[];
    } catch {
      thread = [];
    }
    const runner = await getRunner();
    const toolResult = await runner.executeTool(
      consumed.toolName,
      consumed.toolArgs,
    );
    const executedToolCallId =
      (consumed as { toolCallId?: string }).toolCallId ?? `call_${Date.now()}`;
    const toolOutput = mcpResultToToolResultOutput(toolResult);
    const toolResultMessage = {
      role: "tool" as const,
      content: [
        {
          type: "tool-result" as const,
          toolCallId: executedToolCallId,
          toolName: consumed.toolName,
          output: toolOutput,
        },
      ],
    } as ModelMessage;
    thread.push(toolResultMessage);

    const nextTool = getNextToolCallNeedingApproval(thread);
    if (nextTool) {
      await requestApprovalForTool(deps, {
        event,
        payload,
        channelKey,
        runOptions,
        toolName: nextTool.toolName,
        toolArgs: nextTool.toolArgs,
        toolCallId: nextTool.toolCallId,
        thread,
        historyLength: consumed.historyLength,
        dispatchResponse,
      });
      return;
    }

    // All tools in this assistant message now have a result (approved or rejected). Run agent once to produce final response using all results.
    const result = await runAgent(thread, "", runOptions, chatTimeoutMs);

    if (result.needsApproval) {
      // We already persisted [user, assistant(tool calls)] in the first handleNeedsApproval.
      // Persist only tool results + "User approved." Do NOT persist the new assistant message
      // (it has tool calls with no results yet); it stays in pending until we have results.
      const histLen = consumed.historyLength ?? 0;
      const turnFromHistory =
        result.needsApproval.threadSnapshot.slice(histLen);
      const newMessagesOnly = turnFromHistory.slice(2, -1);
      if (newMessagesOnly.length) {
        await context.addTurnToAgentThread(
          payload.userId,
          newMessagesOnly as ModelMessage[],
        );
      }
      await handleNeedsApproval(deps, {
        event,
        payload,
        channelKey,
        runOptions,
        result,
        dispatchResponse,
      });
      return;
    }

    const assistantText = result.output?.trim() || "Done.";
    await context.addTurnToChatHistory(
      payload.userId,
      payload.text,
      assistantText,
      {
        userAttachments: payload.attachments,
      },
    );
    await dispatchResponse(
      event.id,
      event.source,
      runOptions.channel as ChannelMeta | undefined,
      assistantText,
    );

    // We already persisted [user, assistant(tool call)] in handleNeedsApproval.
    // Persist all tool results (from this sequential approval chain) + run result.
    const historyLength = consumed.historyLength ?? 0;
    const turnFromHistory = thread.slice(historyLength);
    const toolResultsAndRun = [
      ...turnFromHistory.slice(2), // skip user + assistant; keep all tool results
      ...(result.messages ?? []),
    ] as ModelMessage[];
    if (toolResultsAndRun.length) {
      await context.addTurnToAgentThread(payload.userId, toolResultsAndRun);
    } else {
      await context.addTurnToAgentThread(payload.userId, [
        { role: "user", content: payload.text },
        { role: "assistant", content: assistantText },
      ] as ModelMessage[]);
    }
  } catch (err) {
    const msg = (err as Error).message;
    debug(
      "Tool execution failed after approval eventId=%s userId=%s toolName=%s: %o",
      event.id,
      payload.userId,
      consumed.toolName,
      err,
    );
    await auditLog.appendAuditEntry({
      type: "approval_tool_execution_failed",
      payload: {
        eventId: event.id,
        userId: payload.userId,
        toolName: consumed.toolName,
        error: msg,
      },
    });
    const assistantText = `Tool execution failed: ${msg}. Check API logs.`;
    await dispatchResponse(
      event.id,
      event.source,
      runOptions.channel as ChannelMeta | undefined,
      assistantText,
    );
  }
}

/** Request approval for a specific tool (used in sequential approval chain). Does not persist to agent thread. */
async function requestApprovalForTool(
  deps: ChatHandlerDeps,
  ctx: {
    event: NormalizedEvent;
    payload: NormalizedMessagePayload;
    channelKey: string | undefined;
    runOptions: RunChatOptions;
    toolName: string;
    toolArgs: unknown;
    toolCallId: string;
    thread: ModelMessage[];
    historyLength?: number;
    dispatchResponse: (
      eventId: string,
      source: string,
      channelMeta: ChannelMeta | undefined,
      text: string,
      approvalRequest?: { toolName: string; argsPreview: string },
    ) => void | Promise<void>;
  },
): Promise<void> {
  const {
    event,
    payload,
    channelKey,
    runOptions,
    toolName,
    toolArgs,
    toolCallId,
    thread,
    historyLength,
    dispatchResponse,
  } = ctx;
  const { auditLog, context } = deps;

  const raw =
    typeof toolArgs === "object" ? JSON.stringify(toolArgs) : String(toolArgs);
  const argsPreview = raw.length > 80 ? raw.slice(0, 80) + "…" : raw;
  await auditLog.appendAuditEntry({
    type: "approval_requested",
    payload: {
      toolName,
      toolArgsPreview: argsPreview,
      userId: payload.userId,
      channel: (runOptions.channel as { channel?: string } | undefined)
        ?.channel,
      eventId: event.id,
    },
  });

  const channel =
    (
      runOptions.channel as
        | { channel?: "api" | "slack" | "whatsapp" }
        | undefined
    )?.channel ?? event.source;
  const channelTyped = channel as "api" | "slack" | "whatsapp";
  const toolApprovalMode = getConfig().TOOL_APPROVAL_MODE ?? "llm";
  const useLlmForApproval =
    channelTyped !== "api" && toolApprovalMode === "llm";
  const approvalMessage = useLlmForApproval
    ? await formatApprovalMessageWithLlm(channelTyped, toolName, argsPreview)
    : formatApprovalMessage(channelTyped, toolName, argsPreview);

  await setPending(
    payload.userId,
    {
      userId: payload.userId,
      channelMeta: runOptions.channel,
      eventId: event.id,
      toolName,
      toolArgs,
      threadSnapshotJson: JSON.stringify(thread),
      historyLength,
      approvalMessage,
      toolCallId,
      toolId: toolName,
    },
    channelKey,
  );

  const approvalRequest = { toolName, argsPreview };
  await dispatchResponse(
    event.id,
    event.source,
    runOptions.channel as ChannelMeta | undefined,
    approvalMessage,
    event.source === "api" ? approvalRequest : undefined,
  );
  await context.addTurnToChatHistory(
    payload.userId,
    payload.text,
    approvalMessage,
    {
      userAttachments: payload.attachments,
      approvalRequest: event.source === "api" ? approvalRequest : undefined,
    },
  );
}

interface NeedsApprovalCtx {
  event: NormalizedEvent;
  payload: NormalizedMessagePayload;
  channelKey: string | undefined;
  runOptions: RunChatOptions;
  result: RunChatResult;
  dispatchResponse: (
    eventId: string,
    source: string,
    channelMeta: ChannelMeta | undefined,
    text: string,
    approvalRequest?: { toolName: string; argsPreview: string },
  ) => void | Promise<void>;
}

async function handleNeedsApproval(
  deps: ChatHandlerDeps,
  ctx: NeedsApprovalCtx,
): Promise<void> {
  const { event, payload, channelKey, runOptions, result, dispatchResponse } =
    ctx;
  const { context, auditLog } = deps;

  const needsApproval = result.needsApproval!;
  debug(
    "Needs approval eventId=%s userId=%s toolName=%s",
    event.id,
    payload.userId,
    needsApproval.toolName,
  );

  const raw =
    typeof needsApproval.toolArgs === "object"
      ? JSON.stringify(needsApproval.toolArgs)
      : String(needsApproval.toolArgs);
  const argsPreview = raw.length > 80 ? raw.slice(0, 80) + "…" : raw;
  await auditLog.appendAuditEntry({
    type: "approval_requested",
    payload: {
      toolName: needsApproval.toolName,
      toolArgsPreview: argsPreview,
      userId: payload.userId,
      channel: (runOptions.channel as { channel?: string } | undefined)
        ?.channel,
      eventId: event.id,
    },
  });

  const channel =
    (
      runOptions.channel as
        | { channel?: "api" | "slack" | "whatsapp" }
        | undefined
    )?.channel ?? event.source;
  const channelTyped = channel as "api" | "slack" | "whatsapp";
  const toolApprovalMode = getConfig().TOOL_APPROVAL_MODE ?? "llm";
  const useLlmForApproval =
    channelTyped !== "api" && toolApprovalMode === "llm";
  const approvalMessage = useLlmForApproval
    ? await formatApprovalMessageWithLlm(
        channelTyped,
        needsApproval.toolName,
        argsPreview,
      )
    : formatApprovalMessage(channelTyped, needsApproval.toolName, argsPreview);

  const turnToPersist =
    typeof needsApproval.historyLength === "number" &&
    needsApproval.historyLength >= 0
      ? needsApproval.threadSnapshot.slice(needsApproval.historyLength)
      : needsApproval.threadSnapshot;
  if (turnToPersist.length) {
    await context.addTurnToAgentThread(payload.userId, turnToPersist);
  }

  await setPending(
    payload.userId,
    {
      userId: payload.userId,
      channelMeta: runOptions.channel,
      eventId: event.id,
      toolName: needsApproval.toolName,
      toolArgs: needsApproval.toolArgs,
      threadSnapshotJson: JSON.stringify(needsApproval.threadSnapshot),
      historyLength: needsApproval.historyLength,
      approvalMessage,
      ...(needsApproval.toolCallId
        ? { toolCallId: needsApproval.toolCallId }
        : {}),
      ...(needsApproval.toolId ? { toolId: needsApproval.toolId } : {}),
    },
    channelKey,
  );

  const approvalRequest = { toolName: needsApproval.toolName, argsPreview };
  await dispatchResponse(
    event.id,
    event.source,
    runOptions.channel as ChannelMeta | undefined,
    approvalMessage,
    event.source === "api" ? approvalRequest : undefined,
  );
  await context.addTurnToChatHistory(
    payload.userId,
    payload.text,
    approvalMessage,
    {
      userAttachments: payload.attachments,
      approvalRequest: event.source === "api" ? approvalRequest : undefined,
    },
  );
}

interface AgentSuccessCtx {
  event: NormalizedEvent;
  payload: NormalizedMessagePayload;
  result: RunChatResult;
  dispatchResponse: (
    eventId: string,
    source: string,
    channelMeta: ChannelMeta | undefined,
    text: string,
  ) => void | Promise<void>;
}

async function handleAgentSuccess(
  deps: ChatHandlerDeps,
  ctx: AgentSuccessCtx,
): Promise<void> {
  const { event, payload, result, dispatchResponse } = ctx;
  const { context, auditLog } = deps;

  const assistantText =
    result.output?.trim() ||
    "I didn't get a clear response. Try rephrasing or check your API key and model settings.";

  auditLog.emitResponse({
    type: "response",
    text: assistantText,
    eventId: event.id,
    userInput: payload.text,
  });
  await context.addTurnToChatHistory(
    payload.userId,
    payload.text,
    assistantText,
    {
      userAttachments: payload.attachments,
    },
  );
  debug(
    "Dispatching response eventId=%s len=%d",
    event.id,
    assistantText.length,
  );
  await dispatchResponse(
    event.id,
    event.source,
    payload.channelMeta ?? undefined,
    assistantText,
  );

  const messages = result.messages;
  if (messages?.length) {
    await context.addTurnToAgentThread(payload.userId, messages);
  } else {
    await context.addTurnToAgentThread(payload.userId, [
      { role: "user", content: payload.text },
      { role: "assistant", content: assistantText },
    ] as ModelMessage[]);
  }
}

interface ChatErrorCtx {
  event: NormalizedEvent;
  payload: NormalizedMessagePayload;
  err: unknown;
  dispatchResponse: (
    eventId: string,
    source: string,
    channelMeta: ChannelMeta | undefined,
    text: string,
  ) => void | Promise<void>;
}

async function handleChatError(
  deps: ChatHandlerDeps,
  ctx: ChatErrorCtx,
): Promise<void> {
  const { event, payload, err, dispatchResponse } = ctx;
  const { context } = deps;

  const chatTimeoutMs = getConfig().CHAT_TIMEOUT_MS || DEFAULT_CHAT_TIMEOUT_MS;

  let assistantText: string;
  if (err instanceof ChatTimeoutError) {
    debug("Chat timed out after %s ms", chatTimeoutMs);
    assistantText =
      "This is taking longer than expected. The agent may be using a tool. You can try again or rephrase.";
  } else {
    const msg = (err as Error).message;
    assistantText = `Something went wrong: ${msg}. Check API logs.`;
    debug("Chat handler error eventId=%s: %o", event.id, err);
  }

  await context.addTurnToChatHistory(
    payload.userId,
    payload.text,
    assistantText,
    {
      userAttachments: payload.attachments,
    },
  );
  debug("Dispatching error response eventId=%s", event.id);
  await dispatchResponse(
    event.id,
    event.source,
    payload.channelMeta ?? undefined,
    assistantText,
  );
  await context.addTurnToAgentThread(payload.userId, [
    { role: "user", content: payload.text },
    { role: "assistant", content: assistantText },
  ] as ModelMessage[]);
}
