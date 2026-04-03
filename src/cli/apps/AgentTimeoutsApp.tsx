import { useCallback, useEffect, useState, type FC } from "react";
import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";
import TextInput from "ink-text-input";
import {
  read as readConfig,
  write as writeConfig,
} from "../../agents/config.js";
import type { AgentConfig, AgentTimeouts } from "../../agents/types.js";
import {
  DEFAULT_AGENT_TIMEOUTS,
  DEFAULT_MAX_CONTEXT_TOKENS,
  DEFAULT_MAX_TURNS,
  resolvedAgentTimeouts,
  resolvedMaxContextTokens,
  resolvedMaxTurns,
} from "../../agents/timeouts.js";
import { HoomanBanner } from "../ui/HoomanBanner.js";

export type AgentTimeoutsAppProps = {
  readonly agentId: string;
  readonly onBack: () => void;
};

type Step =
  | "loading"
  | "menu"
  | "turn"
  | "tool"
  | "mcp"
  | "maxturns"
  | "maxcontext"
  | "reasoning"
  | "reset-confirm"
  | "error";

const MAX_WALL_MIN = 24 * 60;
const MAX_TOOL_MIN = 24 * 60;
const MAX_MCP_SEC = 600;
const MAX_TURNS_CAP = 10_000;
const MIN_CONTEXT_TOK = 1024;
const MAX_CONTEXT_TOK = 10_000_000;

const RESET_LIMITS_LABEL = "Reset all to defaults (clear overrides)";

function formatContextLabel(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return m % 1 === 0 ? `${m}M` : `${m.toFixed(1)}M`;
  }
  if (n >= 10_000) {
    return `${Math.round(n / 1000)}K`;
  }
  if (n >= 1000) {
    const k = n / 1000;
    return k % 1 === 0 ? `${k}K` : `${k.toFixed(1)}K`;
  }
  return String(n);
}

function parseContextTokens(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/,/g, "");
  if (!s) {
    return null;
  }
  let mult = 1;
  let numStr = s;
  if (s.endsWith("k")) {
    mult = 1000;
    numStr = s.slice(0, -1).trim();
  } else if (s.endsWith("m")) {
    mult = 1_000_000;
    numStr = s.slice(0, -1).trim();
  }
  const v = Number(numStr);
  if (!Number.isFinite(v)) {
    return null;
  }
  const n = Math.round(v * mult);
  if (!Number.isInteger(n) || n < MIN_CONTEXT_TOK || n > MAX_CONTEXT_TOK) {
    return null;
  }
  return n;
}

function parsePositiveInt(s: string): number | null {
  const n = Number(s.trim());
  if (!Number.isInteger(n) || n < 1) {
    return null;
  }
  return n;
}

function ResetLimitsMenuItem({
  label,
  isSelected,
}: {
  label: string;
  isSelected?: boolean;
}) {
  if (label === RESET_LIMITS_LABEL) {
    return (
      <Text color="yellow" bold={isSelected}>
        {label}
      </Text>
    );
  }
  return <Text color={isSelected ? "cyan" : undefined}>{label}</Text>;
}

export const AgentTimeoutsApp: FC<AgentTimeoutsAppProps> = ({
  agentId,
  onBack,
}) => {
  const [step, setStep] = useState<Step>("loading");
  const [cfg, setCfg] = useState<AgentConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const reload = useCallback(async () => {
    setError(null);
    try {
      const c = await readConfig(agentId);
      setCfg(c);
      setStep("menu");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep("error");
    }
  }, [agentId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useInput(
    (input, key) => {
      if (key.ctrl && input === "c") {
        process.exit(0);
        return;
      }
      if (step === "loading") {
        if (key.escape) {
          onBack();
        }
        return;
      }
      if (key.escape) {
        if (step === "menu" || step === "error") {
          onBack();
        } else if (step === "reset-confirm") {
          setStep("menu");
        } else if (
          step === "turn" ||
          step === "tool" ||
          step === "mcp" ||
          step === "maxturns" ||
          step === "maxcontext" ||
          step === "reasoning"
        ) {
          setDraft("");
          setStep("menu");
        }
      }
    },
    {
      isActive:
        step === "loading" ||
        step === "menu" ||
        step === "error" ||
        step === "reset-confirm" ||
        step === "turn" ||
        step === "tool" ||
        step === "mcp" ||
        step === "maxturns" ||
        step === "maxcontext" ||
        step === "reasoning",
    },
  );

  const persistTimeouts = async (patch: AgentTimeouts) => {
    setError(null);
    try {
      const prev = cfg ?? (await readConfig(agentId));
      const next: AgentConfig = {
        ...prev,
        timeouts: { ...prev.timeouts, ...patch },
      };
      await writeConfig(agentId, next);
      setCfg(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const persistMaxTurns = async (maxTurns: number) => {
    setError(null);
    try {
      const prev = cfg ?? (await readConfig(agentId));
      const next: AgentConfig = { ...prev, maxTurns };
      await writeConfig(agentId, next);
      setCfg(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const persistMaxContextTokens = async (maxContextTokens: number) => {
    setError(null);
    try {
      const prev = cfg ?? (await readConfig(agentId));
      const next: AgentConfig = { ...prev, maxContextTokens };
      await writeConfig(agentId, next);
      setCfg(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const persistReasoningEnabled = async (
    mode: "default" | "on" | "off",
  ): Promise<void> => {
    setError(null);
    try {
      const prev = cfg ?? (await readConfig(agentId));
      const next: AgentConfig = { ...prev };
      if (mode === "default") {
        delete next.reasoningEnabled;
      } else if (mode === "on") {
        next.reasoningEnabled = true;
      } else {
        next.reasoningEnabled = false;
      }
      await writeConfig(agentId, next);
      setCfg(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (step === "loading") {
    return (
      <Box flexDirection="column">
        <Text bold>Run limits</Text>
        <Text color="cyan">Loading…</Text>
        <Text dimColor>Esc — back · Ctrl+C — quit</Text>
      </Box>
    );
  }

  if (step === "error") {
    return (
      <Box flexDirection="column">
        <Text bold>Run limits</Text>
        <Text color="red">{error ?? "Error"}</Text>
        <Text dimColor>Esc — back · Ctrl+C — quit</Text>
      </Box>
    );
  }

  if (!cfg) {
    return (
      <Box flexDirection="column">
        <Text bold>Run limits</Text>
        <Text color="red">No config loaded.</Text>
        <Text dimColor>Esc — back · Ctrl+C — quit</Text>
      </Box>
    );
  }

  const resolved = resolvedAgentTimeouts(cfg);
  const maxTurns = resolvedMaxTurns(cfg);

  if (step === "turn") {
    const curMin = Math.round(resolved.turnTimeoutMs / 60_000);
    return (
      <Box flexDirection="column">
        <Text bold>Turn timeout</Text>
        <Text dimColor>
          Wall-clock limit for one user message (model + tools). Current:{" "}
          {curMin} min (default {DEFAULT_AGENT_TIMEOUTS.turnTimeoutMs / 60_000}{" "}
          min).
        </Text>
        <Text dimColor>Enter minutes (1–{MAX_WALL_MIN}). Esc — menu</Text>
        <TextInput
          value={draft}
          placeholder={`e.g. ${curMin}`}
          onChange={setDraft}
          onSubmit={(v) => {
            const n = parsePositiveInt(v);
            if (n === null || n > MAX_WALL_MIN) {
              return;
            }
            void (async () => {
              await persistTimeouts({
                ...cfg.timeouts,
                turnTimeoutMs: n * 60_000,
              });
              setDraft("");
              setStep("menu");
            })();
          }}
        />
      </Box>
    );
  }

  if (step === "tool") {
    const curMin = Math.round(resolved.toolCallTimeoutMs / 60_000);
    return (
      <Box flexDirection="column">
        <Text bold>Tool call timeout</Text>
        <Text dimColor>
          Per MCP tool invocation. Current: {curMin} min (default{" "}
          {DEFAULT_AGENT_TIMEOUTS.toolCallTimeoutMs / 60_000} min).
        </Text>
        <Text dimColor>Enter minutes (1–{MAX_TOOL_MIN}). Esc — menu</Text>
        <TextInput
          value={draft}
          placeholder={`e.g. ${curMin}`}
          onChange={setDraft}
          onSubmit={(v) => {
            const n = parsePositiveInt(v);
            if (n === null || n > MAX_TOOL_MIN) {
              return;
            }
            void (async () => {
              await persistTimeouts({
                ...cfg.timeouts,
                toolCallTimeoutMs: n * 60_000,
              });
              setDraft("");
              setStep("menu");
            })();
          }}
        />
      </Box>
    );
  }

  if (step === "mcp") {
    const curSec = Math.round(resolved.mcpConnectTimeoutMs / 1000);
    return (
      <Box flexDirection="column">
        <Text bold>MCP connect timeout</Text>
        <Text dimColor>
          Outer connect limit and MCP SDK handshake (initialize / listTools
          RPC). Current: {curSec}s (default{" "}
          {DEFAULT_AGENT_TIMEOUTS.mcpConnectTimeoutMs / 1000}s). The SDK
          otherwise defaults to ~5s per request.
        </Text>
        <Text dimColor>Enter seconds (1–{MAX_MCP_SEC}). Esc — menu</Text>
        <TextInput
          value={draft}
          placeholder={`e.g. ${curSec}`}
          onChange={setDraft}
          onSubmit={(v) => {
            const n = parsePositiveInt(v);
            if (n === null || n > MAX_MCP_SEC) {
              return;
            }
            void (async () => {
              await persistTimeouts({
                ...cfg.timeouts,
                mcpConnectTimeoutMs: n * 1000,
              });
              setDraft("");
              setStep("menu");
            })();
          }}
        />
      </Box>
    );
  }

  if (step === "maxturns") {
    return (
      <Box flexDirection="column">
        <Text bold>Max turns</Text>
        <Text dimColor>
          Maximum model/tool loop steps per user message (SDK maxTurns).
          Current: {maxTurns} (default {DEFAULT_MAX_TURNS}).
        </Text>
        <Text dimColor>Enter integer (1–{MAX_TURNS_CAP}). Esc — menu</Text>
        <TextInput
          value={draft}
          placeholder={`e.g. ${maxTurns}`}
          onChange={setDraft}
          onSubmit={(v) => {
            const n = parsePositiveInt(v);
            if (n === null || n > MAX_TURNS_CAP) {
              return;
            }
            void (async () => {
              await persistMaxTurns(n);
              setDraft("");
              setStep("menu");
            })();
          }}
        />
      </Box>
    );
  }

  if (step === "maxcontext") {
    const curCtx = resolvedMaxContextTokens(cfg);
    return (
      <Box flexDirection="column">
        <Text bold>Max context window</Text>
        <Text dimColor>
          Token budget for the chat footer usage bar (not sent to the API).
          Current: {curCtx.toLocaleString()} ({formatContextLabel(curCtx)}),
          default {DEFAULT_MAX_CONTEXT_TOKENS.toLocaleString()} (
          {formatContextLabel(DEFAULT_MAX_CONTEXT_TOKENS)}).
        </Text>
        <Text dimColor>
          Enter tokens (e.g. 50000, 50K, 1M). Range{" "}
          {MIN_CONTEXT_TOK.toLocaleString()}–{MAX_CONTEXT_TOK.toLocaleString()}.
          Esc — menu
        </Text>
        <TextInput
          value={draft}
          placeholder={`e.g. ${formatContextLabel(curCtx)}`}
          onChange={setDraft}
          onSubmit={(v) => {
            const n = parseContextTokens(v);
            if (n === null) {
              return;
            }
            void (async () => {
              await persistMaxContextTokens(n);
              setDraft("");
              setStep("menu");
            })();
          }}
        />
      </Box>
    );
  }

  if (step === "reset-confirm") {
    return (
      <Box flexDirection="column">
        <HoomanBanner subtitle="configure · limits" />
        <Text bold color="yellow">
          Reset run limits?
        </Text>
        <Text dimColor>
          Clears timeouts, max turns, and max context overrides for this agent.
          Model and provider settings are not changed.
        </Text>
        {error ? (
          <Box marginTop={1}>
            <Text color="red">{error}</Text>
          </Box>
        ) : null}
        <Box marginTop={1}>
          <SelectInput
            items={[
              { label: "No", value: "no" },
              { label: "Yes, reset to defaults", value: "yes" },
            ]}
            onSelect={(item) => {
              void (async () => {
                setError(null);
                if (item.value === "no") {
                  setStep("menu");
                  return;
                }
                try {
                  const prev = await readConfig(agentId);
                  const next = { ...prev };
                  delete next.timeouts;
                  delete next.maxTurns;
                  delete next.maxContextTokens;
                  await writeConfig(agentId, next);
                  setCfg(next);
                  setStep("menu");
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                }
              })();
            }}
          />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Esc — cancel · choose No / Yes</Text>
        </Box>
      </Box>
    );
  }

  const turnMin = Math.round(resolved.turnTimeoutMs / 60_000);
  const toolMin = Math.round(resolved.toolCallTimeoutMs / 60_000);
  const mcpSec = Math.round(resolved.mcpConnectTimeoutMs / 1000);
  const maxCtx = resolvedMaxContextTokens(cfg);

  function reasoningMenuLabel(v: AgentConfig["reasoningEnabled"]): string {
    if (v === false) {
      return "off";
    }
    if (v === true) {
      return "on (explicit)";
    }
    return "default (on)";
  }

  if (step === "reasoning") {
    return (
      <Box flexDirection="column">
        <HoomanBanner subtitle="configure · limits" />
        <Text bold color="magenta">
          Reasoning / thinking
        </Text>
        <Text dimColor>
          Controls streamed thinking (e.g. Ollama Gemma) and OpenAI reasoning
          effort. Current: {reasoningMenuLabel(cfg.reasoningEnabled)}.
        </Text>
        {error ? (
          <Box marginTop={1}>
            <Text color="red">{error}</Text>
          </Box>
        ) : null}
        <Box marginTop={1}>
          <SelectInput
            items={[
              {
                label: "Default — enabled when the model supports it",
                value: "default",
              },
              {
                label: "On — force enable where applicable",
                value: "on",
              },
              {
                label: "Off — disable reasoning/thinking",
                value: "off",
              },
            ]}
            onSelect={(item) => {
              void (async () => {
                await persistReasoningEnabled(
                  item.value as "default" | "on" | "off",
                );
                setStep("menu");
              })();
            }}
          />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Esc — menu · Ctrl+C — quit</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <HoomanBanner subtitle="configure · limits" />
      <Text bold color="magenta">
        Run limits
      </Text>
      <Text dimColor>Agent {agentId}</Text>
      {error ? <Text color="red">{error}</Text> : null}
      <SelectInput
        itemComponent={
          ResetLimitsMenuItem as FC<{
            isSelected?: boolean;
            label: string;
          }>
        }
        items={[
          {
            label: `Max turns per message — ${maxTurns}`,
            value: "maxturns",
          },
          {
            label: `Turn timeout — ${turnMin} min`,
            value: "turn",
          },
          {
            label: `Tool call timeout — ${toolMin} min`,
            value: "tool",
          },
          {
            label: `MCP connect timeout — ${mcpSec}s`,
            value: "mcp",
          },
          {
            label: `Max context window — ${formatContextLabel(maxCtx)}`,
            value: "maxcontext",
          },
          {
            label: `Reasoning / thinking — ${reasoningMenuLabel(cfg.reasoningEnabled)}`,
            value: "reasoning",
          },
          {
            label: RESET_LIMITS_LABEL,
            value: "reset",
          },
          { label: "Back", value: "back" },
        ]}
        onSelect={(item) => {
          if (item.value === "back") {
            onBack();
            return;
          }
          if (item.value === "reset") {
            setError(null);
            setStep("reset-confirm");
            return;
          }
          setDraft("");
          setStep(
            item.value as
              | "turn"
              | "tool"
              | "mcp"
              | "maxturns"
              | "maxcontext"
              | "reasoning",
          );
        }}
      />
      <Box marginTop={1}>
        <Text dimColor>Esc — back · Ctrl+C — quit</Text>
      </Box>
    </Box>
  );
};
