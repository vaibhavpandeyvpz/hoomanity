import { describe, expect, it } from "bun:test";
import {
  DEFAULT_STOP_COMMAND_PHRASES,
  isUserStopCommand,
  parseUserControlCommand,
} from "../../src/core/stop-command";

describe("stop commands", () => {
  const phrases = [...DEFAULT_STOP_COMMAND_PHRASES];

  it("matches stop phrases without treating bare cancel as stop", () => {
    expect(isUserStopCommand("stop", phrases)).toBe(true);
    expect(isUserStopCommand("  /stop ", phrases)).toBe(true);
    expect(isUserStopCommand("/cancel", phrases)).toBe(true);
    expect(isUserStopCommand("abort", phrases)).toBe(true);
    expect(isUserStopCommand("cancel", phrases)).toBe(false);
  });

  it("returns false when phrase list is empty", () => {
    expect(isUserStopCommand("stop", [])).toBe(false);
    expect(isUserStopCommand("/stop", [])).toBe(true);
    expect(isUserStopCommand("/cancel", [])).toBe(true);
  });

  it("parses reset as a dedicated built-in command", () => {
    expect(parseUserControlCommand("/reset", phrases)).toBe("reset");
    expect(parseUserControlCommand(" /reset ", [])).toBe("reset");
  });
});
