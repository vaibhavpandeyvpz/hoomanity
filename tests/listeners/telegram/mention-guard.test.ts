import { describe, expect, it } from "bun:test";
import {
  telegramChatIsPrivate,
  telegramMessageMentionsBot,
} from "../../../src/listeners/telegram/mention-guard";

describe("telegramChatIsPrivate", () => {
  it("detects private chats", () => {
    expect(telegramChatIsPrivate({ chat: { type: "private" } })).toBe(true);
  });

  it("detects groups as non-private", () => {
    expect(telegramChatIsPrivate({ chat: { type: "supergroup" } })).toBe(false);
  });
});

describe("telegramMessageMentionsBot", () => {
  const botId = 42;

  it("matches @username in text", () => {
    const hit = telegramMessageMentionsBot(
      {
        text: "hey @MyCoolBot please",
        chat: { type: "supergroup" },
        entities: [{ type: "mention", offset: 4, length: 10 }],
      },
      botId,
      "MyCoolBot",
    );
    expect(hit).toBe(true);
  });

  it("matches text_mention entity", () => {
    const hit = telegramMessageMentionsBot(
      {
        text: "hey there",
        chat: { type: "group" },
        entities: [
          { type: "text_mention", offset: 0, length: 3, user: { id: botId } },
        ],
      },
      botId,
      "unused",
    );
    expect(hit).toBe(true);
  });

  it("returns false without mention in group", () => {
    const hit = telegramMessageMentionsBot(
      {
        text: "no bot here",
        chat: { type: "supergroup" },
      },
      botId,
      "MyCoolBot",
    );
    expect(hit).toBe(false);
  });
});
