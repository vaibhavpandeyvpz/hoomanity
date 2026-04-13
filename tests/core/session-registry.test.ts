import { describe, expect, it } from "bun:test";
import { SessionRegistry } from "../../src/core/session-registry";

describe("SessionRegistry", () => {
  it("stores and looks up mappings by conversation and session", () => {
    const registry = new SessionRegistry();
    registry.upsert("slack:C123", "session-1", "/tmp/project", {
      platform: "slack",
      channelId: "C123",
      threadTs: "1000.1",
    });

    const byConversation = registry.getByConversation("slack:C123");
    const bySession = registry.getBySessionId("session-1");

    expect(byConversation?.sessionId).toBe("session-1");
    expect(bySession?.conversationKey).toBe("slack:C123");
  });
});
