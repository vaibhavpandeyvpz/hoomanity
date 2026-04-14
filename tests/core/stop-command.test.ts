import { describe, expect, it } from "bun:test";
import {
  isUserStopCommand,
  parseUserControlCommand,
} from "../../src/core/stop-command";

describe("stop commands", () => {
  it("matches built-in slash stop commands", () => {
    expect(isUserStopCommand("stop")).toBe(false);
    expect(isUserStopCommand("  /stop ")).toBe(true);
    expect(isUserStopCommand("/cancel")).toBe(true);
    expect(isUserStopCommand("abort")).toBe(false);
    expect(isUserStopCommand("cancel")).toBe(false);
  });

  it("parses reset as a dedicated built-in command", () => {
    expect(parseUserControlCommand("/reset")).toBe("reset");
    expect(parseUserControlCommand(" /reset ")).toBe("reset");
  });
});
