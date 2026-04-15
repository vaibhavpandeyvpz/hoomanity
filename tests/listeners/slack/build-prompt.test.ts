import { describe, expect, it } from "bun:test";
import type { WebClient } from "@slack/web-api";
import { buildSlackPlatformPrompt } from "../../../src/listeners/slack/build-prompt";

describe("buildSlackPlatformPrompt", () => {
  it("returns undefined for subtype messages", async () => {
    const prompt = await buildSlackPlatformPrompt(
      {
        event: {
          type: "message",
          subtype: "channel_join",
          channel: "C123",
          user: "U123",
          text: "<@U123> has joined the channel",
          ts: "123.456",
        },
      },
      {} as WebClient,
      "xoxp-test",
    );

    expect(prompt).toBeUndefined();
  });

  it("embeds channelMeta.self when bot identity is provided", async () => {
    const prompt = await buildSlackPlatformPrompt(
      {
        event: {
          type: "message",
          channel: "C1",
          user: "U9",
          text: "hi <@UBOT>",
          ts: "1.0",
        },
      },
      {} as WebClient,
      "xoxp-test",
      { id: "UBOT", username: "testbot" },
    );
    const meta = prompt?.metadata as {
      channelMeta?: { self?: { id: string; username: string | null } };
    };
    expect(meta?.channelMeta?.self).toEqual({
      id: "UBOT",
      username: "testbot",
    });
  });
});
