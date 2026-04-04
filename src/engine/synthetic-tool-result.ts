import type { AgentInputItem } from "@openai/agents";

const ORPHAN_TOOL_MESSAGE =
  "Tool execution was interrupted or did not complete (crash, timeout, or connection error). No result is available; continue without this tool output.";

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

const MAX_STACK_CHARS = 6_000;

/** Serialize a thrown value for tool output (message, stack, cause chain, AggregateError). */
export function formatCaughtException(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }
  if (error instanceof AggregateError && Array.isArray(error.errors)) {
    const inner = error.errors
      .map((e, i) => `[${i}] ${formatCaughtException(e)}`)
      .join("\n---\n");
    const head =
      error.message?.trim() ||
      `${error.name} (${error.errors.length} nested error(s))`;
    return `${head}\n---\n${inner}`;
  }
  if (error instanceof Error) {
    const lines: string[] = [];
    const msg = error.message?.trim() || "(no message)";
    lines.push(
      error.name && error.name !== "Error" ? `${error.name}: ${msg}` : msg,
    );
    if (error.stack?.trim()) {
      let stack = error.stack.trim();
      if (stack.length > MAX_STACK_CHARS) {
        stack = `${stack.slice(0, MAX_STACK_CHARS)}…\n[stack truncated]`;
      }
      lines.push("", "Stack:", stack);
    }
    if (error.cause !== undefined && error.cause !== null) {
      lines.push("", "Caused by:", formatCaughtException(error.cause));
    }
    return lines.join("\n");
  }
  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return String(error);
  }
}

/**
 * Human- and model-readable payload when a tool throws (e.g. MCP `fetch failed`).
 * Returned as the tool output string so the agent run does not abort.
 */
export function syntheticToolFailureOutput(
  toolName: string,
  error: unknown,
): string {
  const detail = formatCaughtException(error);
  return [
    `[Tool error: ${toolName}]`,
    "",
    detail,
    "",
    "Treat this as a failed tool call. Briefly tell the user if relevant, then continue without relying on this tool's data.",
  ].join("\n");
}

/**
 * After each `function_call` without a matching `function_call_result`, inject a synthetic
 * completed result so the thread is valid for the next `run` (mirrors hooman-runner
 * `sanitizeAgentThread`).
 */
export function sanitizeOrphanFunctionCallResults(
  items: AgentInputItem[],
): AgentInputItem[] {
  const resultCallIds = new Set<string>();
  for (const item of items) {
    if (!isRecord(item) || item.type !== "function_call_result") {
      continue;
    }
    const id = item.callId;
    if (typeof id === "string" && id.trim()) {
      resultCallIds.add(id);
    }
  }

  const out: AgentInputItem[] = [];
  for (const item of items) {
    out.push(item);
    if (!isRecord(item) || item.type !== "function_call") {
      continue;
    }
    const callId = item.callId;
    if (typeof callId !== "string" || !callId.trim()) {
      continue;
    }
    if (resultCallIds.has(callId)) {
      continue;
    }
    resultCallIds.add(callId);
    const name = typeof item.name === "string" ? item.name : "unknown";
    out.push({
      type: "function_call_result",
      callId,
      name,
      status: "completed",
      output: ORPHAN_TOOL_MESSAGE,
    } as AgentInputItem);
  }
  return out;
}
