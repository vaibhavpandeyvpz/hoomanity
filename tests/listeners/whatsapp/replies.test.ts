import { describe, expect, it } from "bun:test";
import { WhatsAppFormatter } from "../../../src/listeners/whatsapp/formatter";
import { WhatsAppReplies } from "../../../src/listeners/whatsapp/replies";

describe("WhatsAppReplies", () => {
  it("swallows platform errors when posting text", async () => {
    const replies = new WhatsAppReplies(
      {
        sendMessage: async () => {
          throw new Error("send failed");
        },
      },
      new WhatsAppFormatter(),
    );

    await expect(
      replies.postText({ platform: "whatsapp", channelId: "1555" }, "hello"),
    ).resolves.toBeUndefined();
  });
});
