import { describe, expect, it } from "bun:test";
import {
  buildWhatsAppPlatformPrompt,
  extractWhatsAppText,
  parseInteractiveApprovalCallback,
  toWhatsAppConversationKey,
} from "../../../src/listeners/whatsapp/build-prompt";

describe("toWhatsAppConversationKey", () => {
  it("prefixes chat id", () => {
    expect(toWhatsAppConversationKey("15551234567")).toBe(
      "whatsapp:15551234567",
    );
  });
});

describe("extractWhatsAppText", () => {
  it("prefers text body", () => {
    expect(
      extractWhatsAppText({
        text: { body: "hello" },
        image: { caption: "ignored" },
      }),
    ).toBe("hello");
  });
});

describe("parseInteractiveApprovalCallback", () => {
  it("parses interactive button payload", () => {
    const parsed = parseInteractiveApprovalCallback({
      interactive: {
        button_reply: {
          id: JSON.stringify({
            requestId: "req-1",
            optionId: "allow_once",
            action: "select",
          }),
        },
      },
    });
    expect(parsed).toEqual({
      requestId: "req-1",
      optionId: "allow_once",
      action: "select",
    });
  });
});

describe("buildWhatsAppPlatformPrompt", () => {
  it("builds prompt with media-only fallback text", () => {
    const prompt = buildWhatsAppPlatformPrompt(
      {
        from: "15551234567",
        id: "wamid.123",
        type: "image",
      },
      [
        {
          localPath: "/tmp/attachment.jpg",
          originalName: "attachment.jpg",
          mimeType: "image/jpeg",
        },
      ],
    );

    expect(prompt?.conversationKey).toBe("whatsapp:15551234567");
    expect(prompt?.text).toBe("User sent media.");
    expect(prompt?.attachments?.length).toBe(1);
  });
});
