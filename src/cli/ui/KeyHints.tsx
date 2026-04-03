import type { ReactNode } from "react";
import { Box, Text } from "ink";

export type KeyHintsMode =
  | "back_quit"
  | "quit_only"
  | "configure_root"
  | "custom";

export type KeyHintsProps = {
  readonly mode?: KeyHintsMode;
  /** Used when mode is `custom` */
  readonly children?: ReactNode;
};

/**
 * Consistent keyboard legend: Esc back (when applicable), Ctrl+C quit.
 */
export function KeyHints({ mode = "back_quit", children }: KeyHintsProps) {
  if (mode === "custom" && children) {
    return (
      <Box marginTop={1}>
        <Text dimColor>{children}</Text>
      </Box>
    );
  }
  let line: string;
  switch (mode) {
    case "quit_only":
      line = "Esc — leave · Ctrl+C — quit";
      break;
    case "configure_root":
      line = "Esc — leave · Ctrl+C — quit";
      break;
    case "back_quit":
    default:
      line = "Esc — back · Ctrl+C — quit";
      break;
  }
  return (
    <Box marginTop={1}>
      <Text dimColor>{line}</Text>
    </Box>
  );
}
