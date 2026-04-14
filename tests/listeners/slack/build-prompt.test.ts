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
      "xoxb-test",
    );

    expect(prompt).toBeUndefined();
  });
});
