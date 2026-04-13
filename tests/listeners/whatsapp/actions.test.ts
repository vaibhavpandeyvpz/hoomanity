import { describe, expect, it } from "bun:test";
import {
  parseWhatsAppApprovalText,
  WhatsAppActions,
} from "../../../src/listeners/whatsapp/actions";

describe("parseWhatsAppApprovalText", () => {
  it("detects cancel intents", () => {
    expect(parseWhatsAppApprovalText("cancel")).toBe("cancel");
    expect(parseWhatsAppApprovalText("no")).toBe("cancel");
    expect(parseWhatsAppApprovalText("hello")).toBe("ignore");
  });
});

describe("WhatsAppActions", () => {
  it("resolves interactive selected option", () => {
    const calls: Array<{ type: string; requestId: string; optionId?: string }> =
      [];
    const actions = new WhatsAppActions({
      selectOption: (requestId: string, optionId: string) => {
        calls.push({ type: "select", requestId, optionId });
        return true;
      },
      cancel: (requestId: string) => {
        calls.push({ type: "cancel", requestId });
        return true;
      },
    } as any);

    const resolved = actions.resolveInteractive({
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

    expect(resolved).toBe(true);
    expect(calls).toEqual([
      { type: "select", requestId: "req-1", optionId: "allow_once" },
    ]);
  });
});
