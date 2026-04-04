import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useContainer } from "../context/ContainerContext.js";
import {
  openAgentSession,
  runAgentSessionTurnStreaming,
  type OpenAgentSession,
  type ToolCallEndInfo,
  type ToolCallStartInfo,
  type TurnUsageSnapshot,
} from "../../agents/exec.js";
import { read as readConfig } from "../../agents/config.js";
import { resolvedMaxContextTokens } from "../../agents/timeouts.js";
import { formatRecollectCompactionLine } from "../../agents/recollect/compaction-notice.js";
import { formatCaughtException } from "../../agents/synthetic-tool-result.js";
import type { McpApprovalPrompt } from "../../agents/allowance.js";
import type { SessionAgentMeta } from "../context/SessionContext.js";

export type ChatMessage =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string }
  | {
      role: "tool_call";
      callId: string;
      toolName: string;
      argsPreview: string;
      phase: "running" | "done";
      resultPreview?: string;
    };

export type AgentSessionState = {
  messages: ChatMessage[];
  isRunning: boolean;
  error: string | null;
  agentMeta: SessionAgentMeta | null;
  runningElapsedSec: number;
  sessionTokensSum: number;
  lastTurnTokens: number | null;
  compactionNotice: string | null;
  liveReasoning: string;
  streamingTpsEst: number | null;
  isReady: boolean;
};

export type AgentSessionActions = {
  submitPrompt: (text: string) => void;
  leaveSession: () => Promise<void>;
  clearError: () => void;
};

function updateLastAssistant(
  messages: ChatMessage[],
  text: string,
): ChatMessage[] {
  const next = [...messages];
  for (let i = next.length - 1; i >= 0; i--) {
    if (next[i].role === "assistant") {
      next[i] = { role: "assistant", text };
      break;
    }
  }
  return next;
}

function insertToolBeforeLastAssistant(
  messages: ChatMessage[],
  tool: Extract<ChatMessage, { role: "tool_call" }>,
): ChatMessage[] {
  const next = [...messages];
  const lastIdx = next.length - 1;
  if (lastIdx >= 0 && next[lastIdx]?.role === "assistant") {
    next.splice(lastIdx, 0, tool);
    return next;
  }
  next.push(tool);
  return next;
}

function applyToolCallEnd(
  messages: ChatMessage[],
  info: ToolCallEndInfo,
): ChatMessage[] {
  return messages.map((msg) =>
    msg.role === "tool_call" && msg.callId === info.callId
      ? { ...msg, phase: "done" as const, resultPreview: info.resultPreview }
      : msg,
  );
}

function stripFailedAssistantTail(messages: ChatMessage[]): ChatMessage[] {
  const next = [...messages];
  while (next.length) {
    const last = next[next.length - 1];
    if (last?.role === "tool_call") {
      next.pop();
      continue;
    }
    if (last?.role === "assistant" && last.text === "") {
      next.pop();
      continue;
    }
    break;
  }
  return next;
}

function toolCallRowFromStart(
  info: ToolCallStartInfo,
): Extract<ChatMessage, { role: "tool_call" }> {
  return {
    role: "tool_call",
    callId: info.callId,
    toolName: info.name,
    argsPreview: info.argsPreview,
    phase: "running",
  };
}

export function useAgentSession(
  agentId: string,
  mcpApprovalPrompt: McpApprovalPrompt,
) {
  const container = useContainer();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agentMeta, setAgentMeta] = useState<SessionAgentMeta | null>(null);
  const [isReady, setIsReady] = useState(false);

  const [runningElapsedSec, setRunningElapsedSec] = useState(0);
  const [sessionTokensSum, setSessionTokensSum] = useState(0);
  const [lastTurnTokens, setLastTurnTokens] = useState<number | null>(null);
  const [compactionNotice, setCompactionNotice] = useState<string | null>(null);
  const [liveReasoning, setLiveReasoning] = useState("");
  const [streamingTpsEst, setStreamingTpsEst] = useState<number | null>(null);

  const sessionRef = useRef<OpenAgentSession | null>(null);
  const compactionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!agentId) return;
    let canceled = false;
    setIsReady(false);
    void (async () => {
      try {
        const cfg = await readConfig(agentId);
        if (!canceled) {
          setAgentMeta({
            name: cfg.name,
            model: cfg.model,
            provider: cfg.provider,
            maxContextTokens: resolvedMaxContextTokens(cfg),
          });
          setIsReady(true);
        }
      } catch (e) {
        if (!canceled) {
          setError(formatCaughtException(e));
          setIsReady(true);
        }
      }
    })();
    return () => {
      canceled = true;
    };
  }, [agentId]);

  useEffect(() => {
    if (!isRunning) {
      setRunningElapsedSec(0);
      return;
    }
    const t0 = Date.now();
    const tick = setInterval(() => {
      setRunningElapsedSec(Math.floor((Date.now() - t0) / 1000));
    }, 400);
    return () => clearInterval(tick);
  }, [isRunning]);

  const attachRecollectCompactionUi = useCallback((open: OpenAgentSession) => {
    open.session.setCompactionNotify((p) => {
      if (compactionTimerRef.current) clearTimeout(compactionTimerRef.current);
      setCompactionNotice(formatRecollectCompactionLine(p));
      compactionTimerRef.current = setTimeout(() => {
        setCompactionNotice(null);
        compactionTimerRef.current = null;
      }, 14_000);
      setSessionTokensSum(open.session.getRecordedApiUsageTotal());
    });
  }, []);

  const streamUiCallbacks = useMemo(
    () => ({
      onReasoningUpdate: setLiveReasoning,
      onStreamingOutputTpsEst: setStreamingTpsEst,
    }),
    [],
  );

  const streamingCallbacks = useMemo(
    () => ({
      onTurnComplete: (u: TurnUsageSnapshot) => {
        setLastTurnTokens(u.totalTokens);
        const rs = sessionRef.current?.session;
        if (rs) {
          rs.recordTurnUsage(u.totalTokens);
          setSessionTokensSum(rs.getRecordedApiUsageTotal());
        } else {
          setSessionTokensSum((x) => x + u.totalTokens);
        }
      },
      onToolCallStart: (info: ToolCallStartInfo) => {
        setMessages((m) =>
          insertToolBeforeLastAssistant(m, toolCallRowFromStart(info)),
        );
      },
      onToolCallEnd: (info: ToolCallEndInfo) => {
        setMessages((m) => applyToolCallEnd(m, info));
      },
    }),
    [],
  );

  const leaveSession = useCallback(async () => {
    if (sessionRef.current) {
      await sessionRef.current.closeMcp();
      sessionRef.current = null;
    }
    if (compactionTimerRef.current) {
      clearTimeout(compactionTimerRef.current);
      compactionTimerRef.current = null;
    }
    setMessages([]);
    setIsRunning(false);
    setLiveReasoning("");
    setStreamingTpsEst(null);
  }, []);

  const submitPrompt = useCallback(
    (text: string) => {
      const t = text.trim();
      if (!t || isRunning) return;

      void (async () => {
        setError(null);
        setIsRunning(true);
        setLiveReasoning("");
        setStreamingTpsEst(null);
        setMessages((m) => [
          ...m,
          { role: "user", text: t },
          { role: "assistant", text: "" },
        ]);

        try {
          if (!sessionRef.current) {
            sessionRef.current = await openAgentSession(container, agentId, {
              mcpApprovalPrompt,
            });
            attachRecollectCompactionUi(sessionRef.current);
          }
          await runAgentSessionTurnStreaming(
            sessionRef.current,
            t,
            (partialText) => {
              setMessages((m) => updateLastAssistant(m, partialText));
            },
            { ...streamingCallbacks, ...streamUiCallbacks },
          );
        } catch (e) {
          setMessages((m) => stripFailedAssistantTail(m));
          setError(formatCaughtException(e));
        } finally {
          setIsRunning(false);
        }
      })();
    },
    [
      agentId,
      attachRecollectCompactionUi,
      container,
      isRunning,
      mcpApprovalPrompt,
      streamUiCallbacks,
      streamingCallbacks,
    ],
  );

  useEffect(() => {
    return () => {
      void leaveSession();
    };
  }, [leaveSession]);

  return {
    state: {
      messages,
      isRunning,
      error,
      agentMeta,
      runningElapsedSec,
      sessionTokensSum,
      lastTurnTokens,
      compactionNotice,
      liveReasoning,
      streamingTpsEst,
      isReady,
    },
    actions: {
      submitPrompt,
      leaveSession,
      clearError: () => setError(null),
    },
  };
}
