import { describe, expect, it } from "bun:test";
import { TelegramListener } from "../../../src/listeners/telegram/client";

function createTelegramListener(botToken: string): TelegramListener {
  return new TelegramListener({
    botToken,
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

describe("TelegramListener.mcpServers", () => {
  it("returns Telegram MCP server config", () => {
    const listener = createTelegramListener("123:telegram-demo");

    expect(listener.mcpServers()).toEqual([
      {
        name: "telegram",
        command: "npx",
        args: ["-y", "@iqai/mcp-telegram"],
        env: [{ name: "TELEGRAM_BOT_TOKEN", value: "123:telegram-demo" }],
      },
    ]);
  });
});
