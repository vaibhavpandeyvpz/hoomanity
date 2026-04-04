import { Box, Text } from "ink";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { theme } from "./theme.js";
import { ASCII_ART } from "./ascii-logo.js";

const TITLE = "hoomanity";

export function HoomanBanner({
  subtitle,
  compact = false,
}: {
  readonly subtitle?: string;
  readonly compact?: boolean;
}) {
  const { cols } = useTerminalSize(24);

  if (compact) {
    // Compact 1-line header for deep screens (Chat)
    const rightSide = subtitle ? ` ${subtitle} ` : " ";
    const availableSpace = Math.max(
      0,
      cols - TITLE.length - rightSide.length - 6,
    );
    const rule = "─".repeat(availableSpace);

    return (
      <Box flexDirection="row" width={cols}>
        <Text color={theme.headerText} backgroundColor={theme.headerBg} bold>
          {` ${TITLE} `}
        </Text>
        <Text color={theme.headerBg} backgroundColor={theme.accentPrimary}>
          {rightSide}
        </Text>
        <Text color={theme.border}>{rule}</Text>
      </Box>
    );
  }

  // Full launch banner
  const inner = Math.max(0, cols - 2);
  const rule = `╭${"─".repeat(inner)}╮`;
  const ruleBot = `╰${"─".repeat(inner)}╯`;

  return (
    <Box flexDirection="column" marginBottom={1} width={cols}>
      <Text color={theme.border}>{rule}</Text>
      <Box
        width={cols}
        flexDirection="row"
        justifyContent="center"
        paddingY={1}
      >
        <Box flexDirection="column">
          {ASCII_ART.map((line, i) => (
            <Text key={i} color={theme.accentPrimary} bold>
              {line}
            </Text>
          ))}
        </Box>
      </Box>
      <Text color={theme.border}>{ruleBot}</Text>
    </Box>
  );
}
