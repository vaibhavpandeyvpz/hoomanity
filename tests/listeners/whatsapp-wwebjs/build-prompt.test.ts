import { describe, expect, it } from "bun:test";
import {
  buildWwebjsPlatformPrompt,
  toWwebjsConversationKey,
} from "../../../src/listeners/whatsapp-wwebjs/build-prompt";

describe("toWwebjsConversationKey", () => {
  it("prefixes chat id", () => {
    expect(toWwebjsConversationKey("12345@c.us")).toBe("whatsapp:12345@c.us");
  });
});

describe("buildWwebjsPlatformPrompt", () => {
  it("builds text prompt for inbound message", async () => {
    const prompt = await buildWwebjsPlatformPrompt({
      from: "12345@c.us",
      body: "hola",
      fromMe: false,
      hasMedia: false,
    });
    expect(prompt?.platform).toBe("wwebjs");
    expect(prompt?.conversationKey).toBe("whatsapp:12345@c.us");
    expect(prompt?.text).toBe("hola");
  });
});
