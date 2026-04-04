import { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { theme } from "./theme.js";
import { ReasoningStrip } from "./ReasoningStrip.js";
import type { ChatMessage as ChatMessageType } from "../hooks/useAgentSession.js";
import { Spinner } from "./Spinner.js";
import { THINKING_VERBS } from "./thinking-verbs.js";

function ThinkingStatus() {
  const [i, setI] = useState(() =>
    Math.floor(Math.random() * THINKING_VERBS.length),
  );

  useEffect(() => {
    // Cycle the fun verbs every 1.5s
    const timer = setInterval(() => {
      setI((prev) => (prev + 1) % THINKING_VERBS.length);
    }, 1500);
    return () => clearInterval(timer);
  }, []);

  return (
    <Box flexDirection="row" marginLeft={1}>
      <Spinner type="star" color={theme.accentPrimary} />
      <Text color={theme.dim}> {THINKING_VERBS[i]}...</Text>
    </Box>
  );
}

/** Try to render args as `key: value` pairs instead of raw JSON. */
function formatArgs(raw: string): string[] {
  if (!raw) return [];
  try {
    const obj = JSON.parse(raw);
    if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
      return [truncLine(raw, 120)];
    }
    const entries = Object.entries(obj);
    if (entries.length === 0) return [];
    return entries.map(([k, v]) => {
      const val = typeof v === "string" ? v : JSON.stringify(v);
      return truncLine(`${k}: ${val}`, 100);
    });
  } catch {
    return [truncLine(raw, 120)];
  }
}

function truncLine(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

type Props = {
  message: ChatMessageType;
  agentName: string;
  isPendingAssistant?: boolean;
  liveReasoning?: string;
};

export function ChatMessage({
  message,
  agentName,
  isPendingAssistant = false,
  liveReasoning = "",
}: Props) {
  if (message.role === "tool_call") {
    const argLines = formatArgs(message.argsPreview);
    const result =
      message.phase === "done" && message.resultPreview
        ? truncLine(message.resultPreview, 120)
        : null;

    return (
      <Box flexDirection="column" marginBottom={1}>
        <Box
          borderStyle="round"
          borderColor={theme.border}
          paddingX={1}
          flexDirection="column"
        >
          <Box flexDirection="row">
            <Text color={theme.dim} bold>
              Tool{" "}
            </Text>
            <Text color={theme.accentSecondary}>{message.toolName}</Text>
          </Box>
          {argLines.map((line, i) => (
            <Text key={i} color={theme.dim}>
              {line}
            </Text>
          ))}
          {message.phase === "running" && (
            <Box flexDirection="row">
              <Spinner type="dots" color={theme.accentPrimary} />
              <Text color={theme.dim}> running…</Text>
            </Box>
          )}
          {result && <Text color={theme.success}>→ {result}</Text>}
        </Box>
      </Box>
    );
  }

  const isUser = message.role === "user";
  const roleName = isUser ? "You" : agentName;
  const roleColor = isUser ? theme.user : theme.agent;

  const showReasoning =
    !isUser && isPendingAssistant && liveReasoning.length > 0;

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box flexDirection="row" marginBottom={0}>
        <Text bold color={roleColor}>
          {roleName}
        </Text>
        {isPendingAssistant && <ThinkingStatus />}
      </Box>
      {showReasoning && <ReasoningStrip text={liveReasoning} />}
      <Text color={theme.text}>
        {message.text || (isPendingAssistant ? "" : "(empty)")}
      </Text>
    </Box>
  );
}
