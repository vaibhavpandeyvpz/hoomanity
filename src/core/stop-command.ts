/** Default `stop_commands` when the key is omitted from config. */
export const DEFAULT_STOP_COMMAND_PHRASES: readonly string[] = [
  "stop",
  "abort",
];

export type UserControlCommand = "cancel" | "reset";

/**
 * Parses built-in chat control commands plus configured stop phrases.
 *
 * Built-ins:
 * - `/reset` starts a fresh session for the same conversation
 * - `/stop` and `/cancel` cancel in-flight work
 *
 * Custom stop phrases from config also map to `"cancel"`.
 */
export function parseUserControlCommand(
  text: string,
  stopPhrases: string[],
): UserControlCommand | undefined {
  const normalized = normalizePhrase(text);
  if (!normalized) {
    return undefined;
  }
  if (normalized === "/reset") {
    return "reset";
  }
  if (normalized === "/stop" || normalized === "/cancel") {
    return "cancel";
  }
  for (const phrase of stopPhrases) {
    if (normalizePhrase(phrase) === normalized) {
      return "cancel";
    }
  }
  return undefined;
}

export function isUserStopCommand(text: string, phrases: string[]): boolean {
  return parseUserControlCommand(text, phrases) === "cancel";
}

function normalizePhrase(value: string): string {
  return value.trim().toLowerCase();
}
