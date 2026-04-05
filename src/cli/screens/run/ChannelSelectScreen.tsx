import { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import figures from "figures";
import { HoomanBanner } from "../../ui/HoomanBanner.js";
import { KeyHints } from "../../ui/KeyHints.js";
import { theme } from "../../ui/theme.js";
import {
  type BotChannelType,
  BOT_CHANNEL_LABELS,
  BOT_CHANNEL_TYPES,
} from "../../../channels/registry.js";
import type { ChannelType } from "../../../channels/types.js";
import { read as readConfig } from "../../../store/agent-config.js";

type Props = {
  agentId: string;
  onSelect: (channel: ChannelType) => void;
  onBack: () => void;
};

type Row = {
  readonly channel: ChannelType;
  /** Bot rows are disabled until config is loaded and that bot is configured. */
  readonly disabled: boolean;
};

const emptyBotConfigured: Record<BotChannelType, boolean> = {
  slack: false,
  whatsapp: false,
};

export function ChannelSelectScreen({ agentId, onSelect, onBack }: Props) {
  const [cfgLoaded, setCfgLoaded] = useState(false);
  const [botConfigured, setBotConfigured] =
    useState<Record<BotChannelType, boolean>>(emptyBotConfigured);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const cfg = await readConfig(agentId);
        if (!cancelled) {
          setBotConfigured({
            slack: Boolean(cfg.slack),
            whatsapp: Boolean(cfg.whatsapp),
          });
          setCfgLoaded(true);
        }
      } catch {
        if (!cancelled) {
          setBotConfigured(emptyBotConfigured);
          setCfgLoaded(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  const rows: Row[] = useMemo(() => {
    const r: Row[] = [
      { channel: "cli", disabled: false },
      ...BOT_CHANNEL_TYPES.map((t) => ({
        channel: t,
        disabled: !cfgLoaded || !botConfigured[t],
      })),
    ];
    return r;
  }, [cfgLoaded, botConfigured]);

  const selectableIndices = useMemo(
    () => rows.map((row, i) => (!row.disabled ? i : -1)).filter((i) => i >= 0),
    [rows],
  );

  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    setCursor((c) => Math.min(c, Math.max(0, selectableIndices.length - 1)));
  }, [selectableIndices.length]);

  const activeRowIndex = selectableIndices[cursor] ?? 0;

  const move = useCallback(
    (delta: number) => {
      if (selectableIndices.length === 0) return;
      setCursor((c) => {
        const len = selectableIndices.length;
        const idx = (c + delta + len) % len;
        return idx;
      });
    },
    [selectableIndices.length],
  );

  useInput(
    (input, key) => {
      if (key.escape) {
        onBack();
        return;
      }
      if (key.upArrow || input === "k") {
        move(-1);
        return;
      }
      if (key.downArrow || input === "j") {
        move(1);
        return;
      }
      if (key.return && selectableIndices.length > 0) {
        const row = rows[activeRowIndex];
        if (row && !row.disabled) {
          onSelect(row.channel);
        }
      }
    },
    { isActive: true },
  );

  const rowLabel = (channel: ChannelType): string =>
    channel === "cli" ? "CLI" : BOT_CHANNEL_LABELS[channel as BotChannelType];

  return (
    <Box flexDirection="column">
      <HoomanBanner subtitle="run · channel" />
      <Text bold color={theme.text}>
        Choose communication channel
      </Text>
      {!cfgLoaded && (
        <Box marginTop={1}>
          <Text dimColor>Loading channel configuration…</Text>
        </Box>
      )}
      <Box marginTop={1} flexDirection="column">
        {rows.map((row, i) => {
          const isFocused = i === activeRowIndex && !row.disabled;
          return (
            <Box key={row.channel}>
              <Box marginRight={1} width={2}>
                {isFocused ? (
                  <Text color={theme.accentPrimary}>{figures.pointer}</Text>
                ) : (
                  <Text> </Text>
                )}
              </Box>
              <Text
                color={
                  row.disabled
                    ? undefined
                    : isFocused
                      ? theme.accentPrimary
                      : theme.text
                }
                dimColor={row.disabled}
              >
                {rowLabel(row.channel)}
              </Text>
            </Box>
          );
        })}
      </Box>
      <Box marginTop={1}>
        <KeyHints mode="custom">
          <Text dimColor>↑↓ · enter — select · esc — back · ctrl+c — quit</Text>
        </KeyHints>
      </Box>
    </Box>
  );
}
