import { describe, expect, it } from "bun:test";
import {
  slackEventsApiShouldIgnoreMissingMention,
  slackConversationIsDirectMessage,
  slackTextMentionsUser,
} from "../../../src/listeners/slack/mention-guard";

describe("slackConversationIsDirectMessage", () => {
  it("treats is_im conversations as direct messages", () => {
    expect(slackConversationIsDirectMessage({ is_im: true })).toBe(true);
  });

  it("treats other conversations as non-dms", () => {
    expect(slackConversationIsDirectMessage({ is_im: false })).toBe(false);
    expect(slackConversationIsDirectMessage({})).toBe(false);
  });
});

describe("slackTextMentionsUser", () => {
  it("matches plain user mentions", () => {
    expect(slackTextMentionsUser("hi <@U123>", "U123")).toBe(true);
  });

  it("matches display-name suffix form", () => {
    expect(slackTextMentionsUser("yo <@U123|botty>", "U123")).toBe(true);
  });

  it("returns false when absent", () => {
    expect(slackTextMentionsUser("no mention here", "U123")).toBe(false);
  });
});

describe("slackEventsApiShouldIgnoreMissingMention", () => {
  const body = (event: Record<string, unknown>) => ({ event });

  it("returns false for direct message channels", async () => {
    const ignore = await slackEventsApiShouldIgnoreMissingMention(
      body({
        type: "message",
        channel: "D111",
        text: "hello",
      }),
      {
        requireMention: true,
        userId: "U9",
        resolveConversation: async () => ({ is_im: true }),
      },
    );
    expect(ignore).toBe(false);
  });

  it("returns false when control command without mention", async () => {
    const ignore = await slackEventsApiShouldIgnoreMissingMention(
      body({
        type: "message",
        channel: "C1",
        text: "cancel",
      }),
      {
        requireMention: true,
        userId: "U9",
        resolveConversation: async () => ({ is_im: false }),
      },
    );
    expect(ignore).toBe(false);
  });

  it("returns true for channel message without mention", async () => {
    const ignore = await slackEventsApiShouldIgnoreMissingMention(
      body({
        type: "message",
        channel: "C1",
        text: "hello team",
      }),
      {
        requireMention: true,
        userId: "U9",
        resolveConversation: async () => ({ is_im: false }),
      },
    );
    expect(ignore).toBe(true);
  });

  it("returns false when bot is mentioned", async () => {
    const ignore = await slackEventsApiShouldIgnoreMissingMention(
      body({
        type: "message",
        channel: "C1",
        text: "<@U9> hi",
      }),
      {
        requireMention: true,
        userId: "U9",
        resolveConversation: async () => ({ is_im: false }),
      },
    );
    expect(ignore).toBe(false);
  });

  it("returns false when require_mention is off", async () => {
    const ignore = await slackEventsApiShouldIgnoreMissingMention(
      body({
        type: "message",
        channel: "C1",
        text: "no mention",
      }),
      {
        requireMention: false,
        userId: "U9",
        resolveConversation: async () => ({ is_im: false }),
      },
    );
    expect(ignore).toBe(false);
  });

  it("returns true for mpim without mention", async () => {
    const ignore = await slackEventsApiShouldIgnoreMissingMention(
      body({
        type: "message",
        channel: "G1",
        text: "hello folks",
      }),
      {
        requireMention: true,
        userId: "U9",
        resolveConversation: async () => ({ is_im: false }),
      },
    );
    expect(ignore).toBe(true);
  });

  it("fails open when conversation lookup is unavailable", async () => {
    const ignore = await slackEventsApiShouldIgnoreMissingMention(
      body({
        type: "message",
        channel: "D111",
        text: "hello",
      }),
      { requireMention: true, userId: "U9" },
    );
    expect(ignore).toBe(false);
  });

  it("fails open when conversation lookup returns nothing", async () => {
    const ignore = await slackEventsApiShouldIgnoreMissingMention(
      body({
        type: "message",
        channel: "C1",
        text: "hello",
      }),
      {
        requireMention: true,
        userId: "U9",
        resolveConversation: async () => undefined,
      },
    );
    expect(ignore).toBe(false);
  });

  it("ignores subtype messages before mention checks", async () => {
    const ignore = await slackEventsApiShouldIgnoreMissingMention(
      body({
        type: "message",
        subtype: "channel_join",
        channel: "C1",
        text: "joined the channel",
      }),
      {
        requireMention: true,
        userId: "U9",
        resolveConversation: async () => ({ is_im: false }),
      },
    );
    expect(ignore).toBe(false);
  });
});
