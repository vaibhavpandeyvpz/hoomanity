import { describe, expect, it } from "bun:test";
import {
  buildWhatsAppPlatformPrompt,
  toWhatsAppConversationKey,
} from "../../../src/listeners/whatsapp/build-prompt";

describe("toWhatsAppConversationKey", () => {
  it("prefixes chat id", () => {
    expect(toWhatsAppConversationKey("12345@c.us")).toBe("whatsapp:12345@c.us");
  });
});

describe("buildWhatsAppPlatformPrompt", () => {
  it("builds text prompt for inbound message", async () => {
    const prompt = await buildWhatsAppPlatformPrompt({
      from: "12345@c.us",
      body: "hola",
      fromMe: false,
      hasMedia: false,
    });
    expect(prompt?.platform).toBe("whatsapp");
    expect(prompt?.conversationKey).toBe("whatsapp:12345@c.us");
    expect(prompt?.text).toBe("hola");
    const meta = prompt?.metadata as {
      channelMeta?: { self?: Record<string, unknown> };
    };
    expect(meta?.channelMeta?.self).toEqual({
      id: null,
      username: null,
      wids: [],
    });
  });
});
