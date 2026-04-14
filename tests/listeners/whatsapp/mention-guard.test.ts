import { describe, expect, it } from "bun:test";
import {
  whatsappChatNeedsMention,
  whatsappMessageChatNeedsMention,
  whatsappMessageMentionsAnyWid,
} from "../../../src/listeners/whatsapp/mention-guard";

describe("whatsappChatNeedsMention", () => {
  it("requires mentions in group chats", () => {
    expect(
      whatsappChatNeedsMention({
        isGroup: true,
        constructor: { name: "GroupChat" },
      }),
    ).toBe(true);
  });

  it("does not require mentions in private chats", () => {
    expect(
      whatsappChatNeedsMention({
        isGroup: false,
        constructor: { name: "PrivateChat" },
      }),
    ).toBe(false);
  });

  it("requires mentions in non-dm chats even when not marked as groups", () => {
    expect(
      whatsappChatNeedsMention({
        isGroup: false,
        constructor: { name: "Channel" },
      }),
    ).toBe(true);
  });
});

describe("whatsappMessageChatNeedsMention", () => {
  it("loads chat metadata from the incoming message", async () => {
    await expect(
      whatsappMessageChatNeedsMention({
        getChat: async () => ({
          isGroup: true,
          constructor: { name: "GroupChat" },
        }),
      }),
    ).resolves.toBe(true);
  });

  it("fails open when chat lookup errors", async () => {
    await expect(
      whatsappMessageChatNeedsMention({
        getChat: async () => {
          throw new Error("chat lookup failed");
        },
      }),
    ).resolves.toBe(false);
  });
});

describe("whatsappMessageMentionsAnyWid", () => {
  it("matches @c.us wid in mentionedIds", () => {
    expect(
      whatsappMessageMentionsAnyWid(
        ["15550000001@c.us", "999@g.us"],
        ["15550000001@c.us"],
      ),
    ).toBe(true);
  });

  it("matches @lid wid in mentionedIds", () => {
    expect(
      whatsappMessageMentionsAnyWid(
        ["abc123@lid"],
        ["15550000001@c.us", "abc123@lid"],
      ),
    ).toBe(true);
  });

  it("matches when mention uses lid and c.us is also registered", () => {
    expect(
      whatsappMessageMentionsAnyWid(
        ["abc123@lid"],
        ["15550000001@c.us", "abc123@lid"],
      ),
    ).toBe(true);
  });

  it("returns false when no wid matches", () => {
    expect(
      whatsappMessageMentionsAnyWid(
        ["15551111111@c.us"],
        ["15550000001@c.us", "abc123@lid"],
      ),
    ).toBe(false);
  });

  it("returns false for empty botWids", () => {
    expect(whatsappMessageMentionsAnyWid(["15550000001@c.us"], [])).toBe(false);
  });

  it("returns false for non-array mentionedIds", () => {
    expect(whatsappMessageMentionsAnyWid(undefined, ["15550000001@c.us"])).toBe(
      false,
    );
  });
});
