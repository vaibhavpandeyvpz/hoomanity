import { describe, expect, it } from "bun:test";
import {
  buildTelegramPlatformPrompt,
  mediaRefsFromTelegramMessage,
  toTelegramConversationKey,
} from "../../../src/listeners/telegram/build-prompt";

describe("toTelegramConversationKey", () => {
  it("prefixes chat id", () => {
    expect(toTelegramConversationKey("12345")).toBe("telegram:12345");
  });
});

describe("buildTelegramPlatformPrompt", () => {
  it("builds prompt for text message", () => {
    const prompt = buildTelegramPlatformPrompt(
      {
        message_id: 42,
        text: "hello from telegram",
        chat: { id: 12345, type: "private", first_name: "Taylor" },
        from: { id: 999, first_name: "Taylor", username: "tay" },
      },
      [],
    );

    expect(prompt?.platform).toBe("telegram");
    expect(prompt?.conversationKey).toBe("telegram:12345");
    expect(prompt?.text).toBe("hello from telegram");
    expect(prompt?.replyTarget).toEqual({
      platform: "telegram",
      channelId: "12345",
      threadTs: undefined,
    });
  });

  it("extracts media refs from supported Telegram attachments", () => {
    const refs = mediaRefsFromTelegramMessage({
      message_id: 7,
      photo: [{ file_id: "small" }, { file_id: "large" }],
      document: {
        file_id: "doc-1",
        file_name: "spec.pdf",
        mime_type: "application/pdf",
      },
      voice: {
        file_id: "voice-1",
      },
    });

    expect(refs).toEqual([
      {
        fileId: "large",
        mimeType: "image/jpeg",
        originalName: "photo-7.jpg",
      },
      {
        fileId: "doc-1",
        mimeType: "application/pdf",
        originalName: "spec.pdf",
      },
      {
        fileId: "voice-1",
        mimeType: "audio/ogg",
        originalName: "voice-7.ogg",
      },
    ]);
  });
});
