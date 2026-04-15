import { describe, expect, it } from "bun:test";
import { SlackListener } from "../../../src/listeners/slack/client";

function createSlackListener(token: string): SlackListener {
  return new SlackListener({
    token,
    appToken: "xapp-demo",
    allowlist: "*",
    requireMention: false,
    orchestrator: {} as any,
    approvals: {
      subscribe: () => () => {},
    } as any,
    sessions: {
      getBySessionId: () => undefined,
    } as any,
  });
}

describe("SlackListener.mcpServers", () => {
  it("returns Slack MCP server config for user tokens", () => {
    const listener = createSlackListener("xoxp-user-token");

    expect(listener.mcpServers()).toEqual([
      {
        name: "_default_slack",
        command: "npx",
        args: ["-y", "slack-mcp-server", "--transport", "stdio"],
        env: [
          { name: "SLACK_MCP_MARK_TOOL", value: "1" },
          {
            name: "SLACK_MCP_ENABLED_TOOLS",
            value: [
              "attachment_get_data",
              "channels_list",
              "conversations_add_message",
              "conversations_history",
              "conversations_replies",
              "conversations_search_messages",
              "conversations_unreads",
              "reactions_add",
              "reactions_remove",
              "users_search",
              "usergroups_list",
              "usergroups_me",
            ].join(","),
          },
          { name: "SLACK_MCP_XOXP_TOKEN", value: "xoxp-user-token" },
        ],
      },
    ]);
  });

  it("returns Slack MCP server config for bot tokens", () => {
    const listener = createSlackListener("xoxb-bot-token");

    expect(listener.mcpServers()).toEqual([
      {
        name: "_default_slack",
        command: "npx",
        args: ["-y", "slack-mcp-server", "--transport", "stdio"],
        env: [
          { name: "SLACK_MCP_MARK_TOOL", value: "1" },
          {
            name: "SLACK_MCP_ENABLED_TOOLS",
            value: [
              "attachment_get_data",
              "channels_list",
              "conversations_add_message",
              "conversations_history",
              "conversations_replies",
              "conversations_search_messages",
              "conversations_unreads",
              "reactions_add",
              "reactions_remove",
              "users_search",
              "usergroups_list",
              "usergroups_me",
            ].join(","),
          },
          { name: "SLACK_MCP_XOXB_TOKEN", value: "xoxb-bot-token" },
        ],
      },
    ]);
  });
});
