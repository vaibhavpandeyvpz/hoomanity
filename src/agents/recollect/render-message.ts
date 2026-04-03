/**
 * Renders a stored agent message as plain text for Recollect summarization
 * (ported from prior `context.ts` backend).
 */
export function renderMessageForSummary(msg: Record<string, unknown>): string {
  const itemType = typeof msg.type === "string" ? msg.type : "";
  if (itemType === "function_call") {
    return `[assistant]: [tool: ${String(msg.name ?? "?")}]`;
  }
  if (itemType === "function_call_result") {
    return `[tool]: [tool result: ${String(msg.name ?? "?")}]`;
  }
  if (itemType === "reasoning") {
    return "[assistant]: [reasoning]";
  }

  const role = msg.role ?? "unknown";
  const content = msg.content;
  if (typeof content === "string") {
    return `[${String(role)}]: ${content}`;
  }
  if (Array.isArray(content)) {
    const parts = content.map((p: unknown) => {
      const q = p as Record<string, unknown>;
      if (q?.type === "text" && typeof q.text === "string") {
        return q.text;
      }
      if (q?.type === "input_text" && typeof q.text === "string") {
        return q.text;
      }
      if (q?.type === "output_text" && typeof q.text === "string") {
        return q.text;
      }
      if (q?.type === "reasoning") {
        return "[reasoning]";
      }
      if (q?.type === "tool-call" || q?.type === "tool_call") {
        return `[tool: ${String(q.toolName ?? q.name ?? "?")}]`;
      }
      if (q?.type === "tool-result" || q?.type === "tool_result") {
        return `[tool result: ${String(q.toolName ?? q.name ?? "?")}]`;
      }
      return JSON.stringify(p);
    });
    return `[${String(role)}]: ${parts.join(" ")}`;
  }
  return `[${String(role)}]: ${JSON.stringify(content)}`;
}
