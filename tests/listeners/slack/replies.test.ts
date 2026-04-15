import { describe, expect, it } from "bun:test";
import { SlackFormatter } from "../../../src/listeners/slack/formatter";
import { SlackReplies } from "../../../src/listeners/slack/replies";

describe("SlackReplies", () => {
  it("swallows platform errors when posting text", async () => {
    const replies = new SlackReplies(
      {
        chat: {
          postMessage: async () => {
            throw new Error("channel_not_found");
          },
          update: async () => ({}),
        },
      } as any,
      new SlackFormatter(),
    );

    await expect(
      replies.postText({ platform: "slack", channelId: "C123" }, "hello"),
    ).resolves.toBeUndefined();
  });
});
