import { useState, useEffect, useRef } from "react";
import { Box, Text, useInput } from "ink";
import { HoomanBanner } from "../../ui/HoomanBanner.js";
import { KeyHints } from "../../ui/KeyHints.js";
import { theme } from "../../ui/theme.js";
import { useContainer } from "../../context/ContainerContext.js";
import { read as readConfig } from "../../../store/agent-config.js";
import { runMergedBotInboundTurn } from "../../../channels/bot-debounced-turn.js";
import { formatBotInboundLogLine } from "../../../channels/bot-inbound-utils.js";
import { formatCliErrorBrief } from "../../error-format.js";
import {
  createDebouncedSerialInboundQueue,
  type DebouncedSerialInboundQueue,
} from "../../../channels/inbound-queue.js";
import {
  type BotChannelType,
  botChannelHumanLabel,
  createBotChannel,
} from "../../../channels/registry.js";
import type { BotMemoryMode } from "../../../engine/memory/session-ids.js";
import type { Channel, ChannelMessage } from "../../../channels/types.js";
import type { OpenAgentSession } from "../../../engine/runner.js";
import { log } from "../../../logging/app-logger.js";

type LogLine = { readonly text: string; readonly isError?: boolean };

type Props = {
  agentId: string;
  channelType: BotChannelType;
  botMemoryMode: BotMemoryMode;
  onBack: () => void;
  onExit: () => void;
};

export function BotStatusScreen({
  agentId,
  channelType,
  botMemoryMode,
  onBack,
  onExit,
}: Props) {
  const container = useContainer();
  const sessionsRef = useRef<Map<string, OpenAgentSession>>(new Map());
  const [status, setStatus] = useState<"connecting" | "ready" | "error">(
    "connecting",
  );
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [agentName, setAgentName] = useState("");

  const addLog = (msg: string, isError = false) => {
    setLogs((prev) => [
      ...prev.slice(-10),
      {
        text: `[${new Date().toLocaleTimeString()}] ${msg}`,
        ...(isError ? { isError: true } : {}),
      },
    ]);
  };

  useEffect(() => {
    let channel: Channel | null = null;
    let inboundQueue: DebouncedSerialInboundQueue | null = null;
    let isMounted = true;

    async function init() {
      try {
        const cfg = await readConfig(agentId);
        if (!isMounted) {
          return;
        }
        setAgentName(cfg.name);
        channel = createBotChannel({
          channelType,
          agentId,
          cfg,
          llmRegistry: container.llmRegistry,
        });
        addLog(`${botChannelHumanLabel(channelType)} channel initialized.`);

        if (!isMounted) {
          return;
        }

        inboundQueue = createDebouncedSerialInboundQueue();

        channel.onMessage(async (msg: ChannelMessage) => {
          addLog(formatBotInboundLogLine(msg));

          inboundQueue?.schedule(msg, async (merged) => {
            await runMergedBotInboundTurn({
              container,
              agentId,
              channelType,
              channel: channel!,
              sessions: sessionsRef.current,
              merged,
              addLog,
              botMemoryMode,
            });
          });
        });

        if (!isMounted) {
          inboundQueue.dispose();
          inboundQueue = null;
          return;
        }

        if (channel.start) {
          await channel.start();
        }

        if (isMounted) setStatus("ready");
        addLog(`${botChannelHumanLabel(channelType)} connected and listening.`);
      } catch (err: unknown) {
        if (isMounted) {
          const msg = formatCliErrorBrief(err);
          setError(msg);
          setStatus("error");
          log.error(`[bot:${channelType}] channel init failed: ${msg}`, err);
        }
      }
    }

    void init();

    return () => {
      isMounted = false;
      inboundQueue?.dispose();
      inboundQueue = null;
      void (async () => {
        for (const open of sessionsRef.current.values()) {
          try {
            await open.closeMcp();
          } catch {
            /* best-effort */
          }
        }
        sessionsRef.current.clear();
        await channel?.stop?.();
      })();
    };
  }, [agentId, channelType, container, botMemoryMode]);

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      onExit();
    }
    if (key.escape) {
      onBack();
    }
  });

  const channelLabel = botChannelHumanLabel(channelType);

  return (
    <Box flexDirection="column" width="100%">
      <HoomanBanner subtitle="run · bot" compact />

      <Box paddingX={1} flexDirection="column" marginTop={1}>
        <Text bold>
          Agent: <Text color={theme.accentPrimary}>{agentName || agentId}</Text>
        </Text>
        <Text>
          Channel:{" "}
          <Text color={theme.accentSecondary}>
            {channelLabel.toUpperCase()}
          </Text>
        </Text>
        <Text dimColor>
          Memory:{" "}
          {botMemoryMode === "single"
            ? "single (main) — shared across all chats"
            : "multi — per DM / channel"}
        </Text>
        <Text>
          Status:{" "}
          {status === "connecting" ? (
            <Text color={theme.dim}>Connecting...</Text>
          ) : status === "ready" ? (
            <Text color={theme.success}>Ready & Listening</Text>
          ) : (
            <Text color={theme.error}>Error</Text>
          )}
        </Text>
        {channelType === "whatsapp" && status === "ready" && (
          <Box marginTop={0}>
            <Text dimColor>
              WhatsApp QR codes print in this terminal (stdout), not in this
              panel.
            </Text>
          </Box>
        )}
      </Box>

      {error && (
        <Box marginTop={1} paddingX={1}>
          <Text color={theme.error}>Error: {error}</Text>
        </Box>
      )}

      <Box
        flexDirection="column"
        marginTop={1}
        borderStyle="round"
        borderColor={theme.dim}
        paddingX={1}
      >
        <Text dimColor italic>
          Last 10 events:
        </Text>
        {logs.map((line, i) =>
          line.isError ? (
            <Text key={i} color={theme.error}>
              {line.text}
            </Text>
          ) : (
            <Text key={i} dimColor>
              {line.text}
            </Text>
          ),
        )}
      </Box>

      <Box marginTop={1}>
        <KeyHints mode="custom">
          <Text dimColor>esc — back to channel · ctrl+c — quit</Text>
        </KeyHints>
      </Box>
    </Box>
  );
}
