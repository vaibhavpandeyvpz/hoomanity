import { describe, expect, it } from "bun:test";
import {
  AcpClient,
  normalizeSessionNotification,
} from "../../src/core/acp-client";

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

describe("AcpClient session metadata", () => {
  it("passes _meta.systemPrompt when creating a session", async () => {
    let request: Record<string, unknown> | undefined;
    const client = new AcpClient({} as any, {} as any);
    (client as any).connection = {
      newSession: async (input: Record<string, unknown>) => {
        request = input;
        return { sessionId: "session-1" };
      },
    };

    const sessionId = await client.newSession(
      "/tmp/workspace",
      [],
      "Prompt body",
    );

    expect(sessionId).toBe("session-1");
    expect(request).toEqual({
      cwd: "/tmp/workspace",
      mcpServers: [],
      _meta: {
        systemPrompt: "Prompt body",
      },
    });
  });

  it("passes _meta.systemPrompt when loading a persisted session", async () => {
    let request: Record<string, unknown> | undefined;
    const client = new AcpClient({} as any, {} as any);
    const mcpServers = [
      {
        name: "_default_slack",
        command: "npx",
        args: ["-y", "slack-mcp-server", "--transport", "stdio"],
        env: [{ name: "SLACK_MCP_XOXP_TOKEN", value: "xoxp-user-token" }],
      },
    ];
    (client as any).connection = {
      loadSession: async (input: Record<string, unknown>) => {
        request = input;
      },
    };
    (client as any).init = {
      agentCapabilities: {
        loadSession: true,
      },
    };

    await client.ensurePersistedSessionReady(
      "session-1",
      "/tmp/workspace",
      mcpServers as any,
      "Prompt body",
    );

    expect(request).toEqual({
      sessionId: "session-1",
      cwd: "/tmp/workspace",
      mcpServers,
      _meta: {
        systemPrompt: "Prompt body",
      },
    });
  });
});
