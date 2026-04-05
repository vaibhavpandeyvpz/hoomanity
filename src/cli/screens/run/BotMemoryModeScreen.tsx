import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";
import { HoomanBanner } from "../../ui/HoomanBanner.js";
import { KeyHints } from "../../ui/KeyHints.js";
import { theme } from "../../ui/theme.js";
import type { BotMemoryMode } from "../../../engine/memory/session-ids.js";
import {
  botChannelHumanLabel,
  type BotChannelType,
} from "../../../channels/registry.js";

type Props = {
  agentName: string;
  channelType: BotChannelType;
  onSelect: (mode: BotMemoryMode) => void;
  onBack: () => void;
  onExit: () => void;
};

export function BotMemoryModeScreen({
  agentName,
  channelType,
  onSelect,
  onBack,
  onExit,
}: Props) {
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
    <Box flexDirection="column">
      <HoomanBanner subtitle="run · bot memory" />
      <Text bold color={theme.text}>
        {agentName}
      </Text>
      <Text color={theme.dim}>
        {channelLabel} — how should conversation memory work?
      </Text>
      <Box marginTop={1}>
        <SelectInput
          items={[
            {
              label: "Single session (main) — one shared history for all chats",
              value: "single",
            },
            {
              label: "Multi-session — separate history per chat",
              value: "multi",
            },
            { label: "Back", value: "__back__" },
          ]}
          onSelect={(item) => {
            if (item.value === "__back__") {
              onBack();
              return;
            }
            if (item.value === "single" || item.value === "multi") {
              onSelect(item.value);
            }
          }}
        />
      </Box>
      <KeyHints mode="custom">
        <Text dimColor>↑↓ · enter — select · esc — back · ctrl+c — quit</Text>
      </KeyHints>
    </Box>
  );
}
