import { type UserControlCommand } from "../contracts";
export type { UserControlCommand };

/**
 * Parses built-in chat control commands.
 *
 * Built-ins:
 * - `reset chat` and `new chat` start a fresh session for the same conversation
 * - `stop` and `cancel` cancel in-flight work
 *
 */
export function parseUserControlCommand(
  text: string,
): UserControlCommand | undefined {
  const normalized = normalizePhrase(text);
  if (!normalized) {
    return undefined;
  }
  if (normalized === "reset chat" || normalized === "new chat") {
    return "reset";
  }
  if (normalized === "stop" || normalized === "cancel") {
    return "cancel";
  }
  return undefined;
}

export function isUserStopCommand(text: string): boolean {
  return parseUserControlCommand(text) === "cancel";
}

function normalizePhrase(value: string): string {
  return value.trim().toLowerCase();
}
