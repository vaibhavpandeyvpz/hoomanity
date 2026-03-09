/**
 * Scheduled task event handler. Runs the agent with task intent and context.
 * Extracted from event-handlers.ts for clarity.
 */
import createDebug from "debug";
import type { NormalizedEvent } from "../types.js";
import type { AuditLog } from "../audit/audit.js";
import type { RunChatOptions } from "../agents/hooman-runner.js";
import { getConfig } from "../config.js";
import {
  DEFAULT_CHAT_TIMEOUT_MS,
  type RunAgentFn,
} from "./chat-handler-shared.js";

const debug = createDebug("hooman:scheduled-task-handler");

export interface ScheduledTaskHandlerDeps {
  auditLog: AuditLog;
  runAgent: RunAgentFn;
}

export function createScheduledTaskHandler(
  deps: ScheduledTaskHandlerDeps,
): (event: NormalizedEvent) => Promise<void> {
  const { auditLog, runAgent } = deps;

  return async (event: NormalizedEvent) => {
    if (event.payload.kind !== "scheduled_task") return;

    const payload = event.payload;
    const contextStr =
      Object.keys(payload.context).length === 0
        ? "(none)"
        : Object.entries(payload.context)
            .map(([k, v]) => `${k}=${String(v)}`)
            .join(", ");
    const text = `Scheduled task: ${payload.intent}. Context: ${contextStr}.`;
    const runOptions: RunChatOptions = {
      sessionId: payload.context.userId
        ? String(payload.context.userId)
        : undefined,
    };
    const chatTimeoutMs =
      getConfig().CHAT_TIMEOUT_MS || DEFAULT_CHAT_TIMEOUT_MS;

    try {
      const { output } = await runAgent([], text, runOptions, chatTimeoutMs);
      const assistantText =
        output?.trim() ||
        "Scheduled task completed (no clear response from agent).";
      await auditLog.appendAuditEntry({
        type: "scheduled_task",
        payload: {
          intent: payload.intent,
          context: payload.context,
          ...(payload.execute_at ? { execute_at: payload.execute_at } : {}),
          ...(payload.cron ? { cron: payload.cron } : {}),
        },
      });
      auditLog.emitResponse({
        type: "response",
        text: assistantText,
        eventId: event.id,
        userInput: text,
      });
    } catch (err) {
      debug("scheduled task handler error: %o", err);
      const msg = (err as Error).message;
      await auditLog.appendAuditEntry({
        type: "scheduled_task",
        payload: {
          intent: payload.intent,
          context: payload.context,
          ...(payload.execute_at ? { execute_at: payload.execute_at } : {}),
          ...(payload.cron ? { cron: payload.cron } : {}),
          error: msg,
        },
      });
      auditLog.emitResponse({
        type: "response",
        text: `Scheduled task failed: ${msg}. Check API logs.`,
        eventId: event.id,
        userInput: text,
      });
    }
  };
}
