import { describe, expect, it } from "bun:test";
import { TelegramFormatter } from "../../../src/listeners/telegram/formatter";
import { TelegramReplies } from "../../../src/listeners/telegram/replies";

describe("TelegramReplies", () => {
  it("swallows platform errors when posting text", async () => {
    const replies = new TelegramReplies(
      {
        sendMessage: async () => {
          throw new Error("chat not found");
        },
        editMessageText: async () => ({}),
      } as any,
      new TelegramFormatter(),
    );

    await expect(
      replies.postText({ platform: "telegram", channelId: "123" }, "hello"),
    ).resolves.toBeUndefined();
  });
});
