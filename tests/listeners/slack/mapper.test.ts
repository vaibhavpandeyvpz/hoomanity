import { describe, expect, it } from "bun:test";
import {
  combineSlackMessageText,
  textFromSlackBlocks,
  toConversationKey,
} from "../../../src/listeners/slack/mapper";

describe("toConversationKey", () => {
  it("prefixes slack channel id", () => {
    expect(toConversationKey("C123")).toBe("slack:C123");
  });
});

describe("textFromSlackBlocks", () => {
  it("extracts nested block text", () => {
    const text = textFromSlackBlocks([
      { type: "section", text: { type: "mrkdwn", text: "Hello from blocks" } },
    ]);
    expect(text).toContain("Hello from blocks");
  });
});

describe("combineSlackMessageText", () => {
  it("joins raw slack text and block-derived text", () => {
    const combined = combineSlackMessageText("line one", [
      { type: "section", text: { type: "mrkdwn", text: "line two" } },
    ]);
    expect(combined).toContain("line one");
    expect(combined).toContain("line two");
  });
});
