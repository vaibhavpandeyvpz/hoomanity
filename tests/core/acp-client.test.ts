import { describe, expect, it } from "bun:test";
import { normalizeSessionNotification } from "../../src/core/acp-client";

describe("normalizeSessionNotification", () => {
  it("maps text chunks to core message events", () => {
    const events = normalizeSessionNotification({
      sessionId: "session-1",
      update: {
        sessionUpdate: "agent_message_chunk",
        content: {
          type: "text",
          text: "hello",
        },
      },
    } as any);

    expect(events[0]?.kind).toBe("message_chunk");
    if (events[0]?.kind === "message_chunk") {
      expect(events[0].text).toBe("hello");
    }
  });
});
