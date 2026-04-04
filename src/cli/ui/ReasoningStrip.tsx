import { Box, Text } from "ink";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { wrapReasoningToLines } from "../utils/text-wrap.js";
import { theme } from "./theme.js";

const DEFAULT_MAX_VISIBLE = 2;

type ReasoningStripProps = {
  readonly text: string;
  /** How many wrapped lines to show (tail = vertical scroll). */
  readonly maxVisibleLines?: number;
};

/**
 * Muted reasoning under the agent name: word-wrapped to terminal width, only the last
 * `maxVisibleLines` rows kept so long streams scroll upward.
 */
export function ReasoningStrip({
  text,
  maxVisibleLines = DEFAULT_MAX_VISIBLE,
}: ReasoningStripProps) {
  const { cols } = useTerminalSize(40);

  const allLines = wrapReasoningToLines(text, cols);
  if (allLines.length === 0) {
    return null;
  }

  const visible = allLines.slice(-maxVisibleLines);

  return (
    <Box flexDirection="column" width={cols}>
      {visible.map((line, i) => (
        <Text key={i} color={theme.dim} wrap="wrap">
          {line || " "}
        </Text>
      ))}
    </Box>
  );
}
