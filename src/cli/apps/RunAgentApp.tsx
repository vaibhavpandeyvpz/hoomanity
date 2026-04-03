import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";
import TextInput from "ink-text-input";
import { read as readConfig } from "../../agents/config.js";
import {
  get as getRegistryEntry,
  list as listRegistry,
} from "../../agents/registry.js";
import type { HoomanContainer } from "../container.js";
import {
  openAgentSession,
  runAgentSessionTurnStreaming,
  type OpenAgentSession,
  type ToolCallEndInfo,
  type ToolCallStartInfo,
  type TurnUsageSnapshot,
} from "../../agents/exec.js";
import type {
  McpApprovalChoice,
  McpApprovalPrompt,
} from "../../agents/allowance.js";
import { HoomanBanner } from "../ui/HoomanBanner.js";
import { KeyHints } from "../ui/KeyHints.js";
import { SessionStatusBar } from "../ui/SessionStatusBar.js";
import { formatRecollectCompactionLine } from "../../agents/recollect/compaction-notice.js";
import {
  DEFAULT_MAX_CONTEXT_TOKENS,
  resolvedMaxContextTokens,
} from "../../agents/timeouts.js";

export type RunAgentAppProps = {
  readonly container: HoomanContainer;
  readonly initialAgentId?: string;
  readonly initialPrompt?: string;
  /** When set (nested main menu), call instead of `process.exit`. */
  readonly onExit?: () => void;
  /** From prompt step, Esc returns to the previous menu when set. */
  readonly onBack?: () => void;
};

type Step = "select" | "chat" | "running" | "error";

type ChatMessage =
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

const AGENT_DISABLED_MSG =
  "This agent is disabled. Enable it with `hooman configure` before running.";

function exitOrQuit(onExit: RunAgentAppProps["onExit"]): void {
  if (onExit) {
    onExit();
  } else {
    process.exit(0);
  }
}

async function closeSession(open: OpenAgentSession | null): Promise<void> {
  if (!open) {
    return;
  }
  await open.closeMcp();
}

function BrailleSpinner() {
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  const colors = ["yellow", "cyan", "magenta", "green", "blue"] as const;
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setI((x) => (x + 1) % frames.length);
    }, 80);
    return () => clearInterval(id);
  }, []);
  return (
    <Text color={colors[i % colors.length]} bold>
      {frames[i]}{" "}
    </Text>
  );
}

function McpApprovalBlock({
  toolName,
  inputPreview,
  onChoice,
}: {
  readonly toolName: string;
  readonly inputPreview: string;
  readonly onChoice: (choice: McpApprovalChoice) => void;
}) {
  useInput(
    (_input, key) => {
      if (key.escape) {
        onChoice("deny");
      }
    },
    { isActive: true },
  );
  return (
    <Box
      flexDirection="column"
      marginBottom={1}
      borderStyle="double"
      borderColor="magenta"
      paddingX={1}
    >
      <Text bold color="magenta">
        MCP tool approval
      </Text>
      <Text>
        Tool <Text color="cyan">{toolName}</Text>
      </Text>
      {inputPreview ? (
        <Text dimColor>
          {inputPreview.length > 400
            ? `${inputPreview.slice(0, 397)}…`
            : inputPreview}
        </Text>
      ) : null}
      <SelectInput
        items={[
          { label: "Allow once", value: "allow" as const },
          {
            label: "Always allow for this agent",
            value: "allow_always" as const,
          },
          { label: "Deny", value: "deny" as const },
        ]}
        onSelect={(item) => {
          onChoice(item.value);
        }}
      />
      <Text dimColor>↑↓ Enter — choose · Esc — deny</Text>
    </Box>
  );
}

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
      ? {
          ...msg,
          phase: "done" as const,
          resultPreview: info.resultPreview,
        }
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

export function RunAgentApp({
  container,
  initialAgentId,
  initialPrompt,
  onExit,
  onBack,
}: RunAgentAppProps) {
  const idInit = initialAgentId?.toUpperCase() ?? "";
  const promptInit = initialPrompt?.trim() ?? "";

  const [step, setStep] = useState<Step>(() => {
    if (idInit && promptInit) {
      return "running";
    }
    if (idInit) {
      return "chat";
    }
    return "select";
  });

  const [agentId, setAgentId] = useState(idInit);
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(!idInit);

  const [registryRows, setRegistryRows] = useState<
    { id: string; label: string }[]
  >([]);
  const [totalAgentCount, setTotalAgentCount] = useState(0);

  const sessionRef = useRef<OpenAgentSession | null>(null);
  const initialCliRunStarted = useRef(false);
  const approvalResolveRef = useRef<
    ((choice: McpApprovalChoice) => void) | null
  >(null);
  const [mcpApprovalInfo, setMcpApprovalInfo] = useState<{
    toolName: string;
    inputPreview: string;
    callId: string | undefined;
  } | null>(null);

  const [agentMeta, setAgentMeta] = useState<{
    name: string;
    model: string;
    provider: string;
    maxContextTokens: number;
  } | null>(null);
  const [lastTurnTokens, setLastTurnTokens] = useState<number | null>(null);
  const [sessionTokensSum, setSessionTokensSum] = useState(0);
  const [runningElapsedSec, setRunningElapsedSec] = useState(0);
  const [compactionNotice, setCompactionNotice] = useState<string | null>(null);
  const compactionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const attachRecollectCompactionUi = useCallback((open: OpenAgentSession) => {
    open.session.setCompactionNotify((p) => {
      if (compactionTimerRef.current) {
        clearTimeout(compactionTimerRef.current);
      }
      setCompactionNotice(formatRecollectCompactionLine(p));
      compactionTimerRef.current = setTimeout(() => {
        setCompactionNotice(null);
        compactionTimerRef.current = null;
      }, 14_000);
      setSessionTokensSum(open.session.getRecordedApiUsageTotal());
    });
  }, []);

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

  const completeMcpApproval = useCallback((choice: McpApprovalChoice) => {
    const resolve = approvalResolveRef.current;
    approvalResolveRef.current = null;
    setMcpApprovalInfo(null);
    resolve?.(choice);
  }, []);

  const mcpApprovalPrompt = useCallback<McpApprovalPrompt>((info) => {
    return new Promise((resolve) => {
      const raw =
        typeof info.input === "string"
          ? info.input
          : info.input == null
            ? ""
            : JSON.stringify(info.input);
      const inputPreview = raw.length > 400 ? `${raw.slice(0, 397)}…` : raw;
      approvalResolveRef.current = resolve;
      setMcpApprovalInfo({
        toolName: info.toolName,
        inputPreview,
        callId: info.callId,
      });
    });
  }, []);

  useEffect(() => {
    const id = agentId.trim();
    if (!id) {
      setAgentMeta(null);
      return;
    }
    void (async () => {
      try {
        const cfg = await readConfig(id);
        setAgentMeta({
          name: cfg.name,
          model: cfg.model,
          provider: cfg.provider,
          maxContextTokens: resolvedMaxContextTokens(cfg),
        });
      } catch {
        setAgentMeta(null);
      }
    })();
  }, [agentId]);

  useEffect(() => {
    if (step !== "running") {
      setRunningElapsedSec(0);
      return;
    }
    const t0 = Date.now();
    const tick = setInterval(() => {
      setRunningElapsedSec(Math.floor((Date.now() - t0) / 1000));
    }, 400);
    return () => clearInterval(tick);
  }, [step]);

  useEffect(() => {
    return () => {
      const pending = approvalResolveRef.current;
      if (pending) {
        approvalResolveRef.current = null;
        pending("deny");
      }
      if (compactionTimerRef.current) {
        clearTimeout(compactionTimerRef.current);
        compactionTimerRef.current = null;
      }
      void closeSession(sessionRef.current);
      sessionRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (idInit) {
      return;
    }
    void (async () => {
      try {
        const rows = await listRegistry();
        setTotalAgentCount(rows.length);
        const items: { id: string; label: string }[] = [];
        for (const r of rows) {
          if (!r.enabled) {
            continue;
          }
          let name = "?";
          try {
            name = (await readConfig(r.id)).name;
          } catch {
            /* */
          }
          items.push({
            id: r.id,
            label: `${name} [${r.id}]`,
          });
        }
        setRegistryRows(items);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setStep("error");
      } finally {
        setLoadingList(false);
      }
    })();
  }, [container, idInit]);

  useEffect(() => {
    if (!idInit || promptInit) {
      return;
    }
    void (async () => {
      const entry = await getRegistryEntry(idInit);
      if (entry && !entry.enabled) {
        setError(AGENT_DISABLED_MSG);
        setStep("error");
      }
    })();
  }, [container, idInit, promptInit]);

  useEffect(() => {
    if (!idInit || !promptInit || initialCliRunStarted.current) {
      return;
    }
    initialCliRunStarted.current = true;
    void (async () => {
      setError(null);
      const entry = await getRegistryEntry(idInit);
      if (!entry?.enabled) {
        setError(AGENT_DISABLED_MSG);
        setStep("error");
        return;
      }
      setMessages([
        { role: "user", text: promptInit },
        { role: "assistant", text: "" },
      ]);
      try {
        await closeSession(sessionRef.current);
        sessionRef.current = null;
        const s = await openAgentSession(container, idInit, {
          mcpApprovalPrompt,
        });
        sessionRef.current = s;
        attachRecollectCompactionUi(s);
        await runAgentSessionTurnStreaming(
          s,
          promptInit,
          (text) => {
            setMessages((m) => updateLastAssistant(m, text));
          },
          streamingCallbacks,
        );
        setStep("chat");
      } catch (e) {
        setMessages((m) => stripFailedAssistantTail(m));
        setError(e instanceof Error ? e.message : String(e));
        setStep("error");
      }
    })();
  }, [
    attachRecollectCompactionUi,
    container,
    idInit,
    mcpApprovalPrompt,
    promptInit,
    streamingCallbacks,
  ]);

  const selectItems = useMemo(
    () => registryRows.map((r) => ({ label: r.label, value: r.id })),
    [registryRows],
  );

  useInput(
    (input, key) => {
      const leaveSession = async (): Promise<void> => {
        await closeSession(sessionRef.current);
        sessionRef.current = null;
      };

      if (mcpApprovalInfo) {
        return;
      }
      if (key.ctrl && input === "c") {
        void (async () => {
          await leaveSession();
          process.exit(0);
        })();
        return;
      }
      if (key.escape) {
        void (async () => {
          await leaveSession();
          if (step === "chat" && onBack) {
            onBack();
          } else {
            exitOrQuit(onExit);
          }
        })();
      }
    },
    {
      isActive:
        !mcpApprovalInfo &&
        (step === "error" ||
          step === "select" ||
          step === "chat" ||
          step === "running"),
    },
  );

  if (loadingList && step === "select") {
    return (
      <Box flexDirection="column">
        <HoomanBanner subtitle="chat" />
        <Text color="cyan">Loading agents…</Text>
        <KeyHints mode="quit_only" />
      </Box>
    );
  }

  if (step === "select" && registryRows.length === 0 && !loadingList) {
    if (totalAgentCount > 0) {
      return (
        <Box flexDirection="column">
          <HoomanBanner subtitle="chat" />
          <Text>
            No enabled agents. Enable one with{" "}
            <Text color="magenta">hooman configure</Text>, then try again.
          </Text>
          <KeyHints mode="quit_only" />
        </Box>
      );
    }
    return (
      <Box flexDirection="column">
        <HoomanBanner subtitle="chat" />
        <Text>No agents yet.</Text>
        <Text dimColor>
          Create one with <Text color="magenta">hooman configure</Text>.
        </Text>
        <KeyHints mode="quit_only" />
      </Box>
    );
  }

  if (step === "select") {
    return (
      <Box flexDirection="column">
        <HoomanBanner subtitle="chat" />
        <Text bold color="magenta">
          Pick an agent
        </Text>
        <Text dimColor>↑↓ · Enter — start chat</Text>
        <Box marginTop={1}>
          <SelectInput
            items={selectItems}
            onSelect={(item) => {
              void (async () => {
                await closeSession(sessionRef.current);
                sessionRef.current = null;
                setAgentId(item.value);
                setMessages([]);
                setPrompt("");
                setError(null);
                setSessionTokensSum(0);
                setLastTurnTokens(null);
                setCompactionNotice(null);
                setStep("chat");
              })();
            }}
          />
        </Box>
        <KeyHints mode="quit_only" />
      </Box>
    );
  }

  if (step === "error") {
    return (
      <Box flexDirection="column">
        <HoomanBanner subtitle="chat" />
        <Text bold color="red">
          Error
        </Text>
        <Text color="red">{error}</Text>
        <KeyHints mode="quit_only" />
      </Box>
    );
  }

  const submitPrompt = (raw: string): void => {
    const t = raw.trim();
    if (!t || step !== "chat") {
      return;
    }
    void (async () => {
      setPrompt("");
      setError(null);
      const entry = await getRegistryEntry(agentId);
      if (!entry?.enabled) {
        setError(AGENT_DISABLED_MSG);
        setStep("error");
        return;
      }
      setStep("running");
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
          (text) => {
            setMessages((m) => updateLastAssistant(m, text));
          },
          streamingCallbacks,
        );
        setStep("chat");
      } catch (e) {
        setMessages((m) => stripFailedAssistantTail(m));
        setError(e instanceof Error ? e.message : String(e));
        setStep("error");
      }
    })();
  };

  const ctxWin = agentMeta?.maxContextTokens ?? DEFAULT_MAX_CONTEXT_TOKENS;

  const assistantLabel = agentMeta?.name?.trim().length
    ? agentMeta.name.trim()
    : "Agent";

  return (
    <Box flexDirection="column">
      <HoomanBanner subtitle="chat" />
      <Box marginTop={1} flexDirection="column">
        {messages.length === 0 && step === "chat" ? (
          <Text dimColor>
            Message the agent — Enter to send. Esc
            {onBack ? " — back to menu" : " — leave"} · Ctrl+C — quit
          </Text>
        ) : null}
        {messages.map((m, i) => {
          if (m.role === "tool_call") {
            return (
              <Box key={i} flexDirection="column" marginBottom={1}>
                <Box
                  borderStyle="single"
                  borderColor="gray"
                  paddingX={1}
                  flexDirection="column"
                >
                  <Box flexDirection="row">
                    <Text dimColor bold>
                      Tool{" "}
                    </Text>
                    <Text color="yellow">{m.toolName}</Text>
                  </Box>
                  {m.argsPreview ? <Text dimColor>{m.argsPreview}</Text> : null}
                  {m.phase === "done" && m.resultPreview ? (
                    <Text dimColor>→ {m.resultPreview}</Text>
                  ) : null}
                </Box>
              </Box>
            );
          }
          const isPendingAssistant =
            m.role === "assistant" &&
            step === "running" &&
            i === messages.length - 1 &&
            m.text === "";
          return (
            <Box key={i} flexDirection="column" marginBottom={1}>
              <Box flexDirection="row">
                <Text
                  bold={m.role === "user"}
                  color={m.role === "user" ? "cyan" : "green"}
                >
                  {m.role === "user" ? "You" : assistantLabel}
                  {m.role === "assistant" ? " " : ""}
                </Text>
                {isPendingAssistant ? <BrailleSpinner /> : null}
              </Box>
              <Text>{m.text || (isPendingAssistant ? "" : "(empty)")}</Text>
            </Box>
          );
        })}
      </Box>
      {compactionNotice ? (
        <Box marginTop={1}>
          <Text dimColor wrap="truncate-end">
            {compactionNotice}
          </Text>
        </Box>
      ) : null}
      {mcpApprovalInfo ? (
        <Box marginTop={1}>
          <McpApprovalBlock
            toolName={mcpApprovalInfo.toolName}
            inputPreview={mcpApprovalInfo.inputPreview}
            onChoice={completeMcpApproval}
          />
        </Box>
      ) : null}
      {step === "chat" ? (
        <Box
          flexDirection="column"
          marginTop={1}
          borderStyle="single"
          borderColor="cyan"
          paddingX={1}
        >
          <Text bold color="white">
            Message
          </Text>
          <TextInput
            value={prompt}
            placeholder="Type your message…"
            onChange={setPrompt}
            onSubmit={submitPrompt}
          />
        </Box>
      ) : null}
      <SessionStatusBar
        agentName={agentMeta?.name ?? "…"}
        agentId={agentId}
        modelLabel={agentMeta?.model ?? "…"}
        lastTurnTokens={lastTurnTokens}
        sessionTokens={sessionTokensSum}
        contextWindow={ctxWin}
        elapsedRunningSec={step === "running" ? runningElapsedSec : null}
        isRunning={step === "running" && !mcpApprovalInfo}
      />
      <KeyHints
        mode="custom"
        children={
          step === "chat"
            ? onBack
              ? "Esc — back to menu · Ctrl+C — quit"
              : "Esc — leave · Ctrl+C — quit"
            : "Esc — leave session · Ctrl+C — quit"
        }
      />
    </Box>
  );
}
