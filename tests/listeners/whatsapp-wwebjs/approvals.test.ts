import { describe, expect, it } from "bun:test";
import {
  parseApprovalReplyText,
  resolveApprovalFromText,
} from "../../../src/listeners/whatsapp-wwebjs/approvals";

describe("parseApprovalReplyText", () => {
  it("maps yes/no/always variants", () => {
    expect(parseApprovalReplyText("yes")).toBe("approve_once");
    expect(parseApprovalReplyText("always")).toBe("approve_always");
    expect(parseApprovalReplyText("no")).toBe("reject");
    expect(parseApprovalReplyText("maybe")).toBe("ignore");
  });
});

describe("resolveApprovalFromText", () => {
  it("selects allow_always when user replies always", () => {
    let selected: { requestId: string; optionId: string } | undefined;
    const approvals = {
      selectOption: (requestId: string, optionId: string) => {
        selected = { requestId, optionId };
        return true;
      },
      cancel: () => false,
    } as any;

    const resolved = resolveApprovalFromText(
      approvals,
      {
        requestId: "req-1",
        options: [
          { optionId: "allow_once", kind: "allow_once", name: "Allow once" },
          {
            optionId: "allow_always",
            kind: "allow_always",
            name: "Always allow",
          },
        ],
      },
      "always",
    );

    expect(resolved).toBe(true);
    expect(selected).toEqual({ requestId: "req-1", optionId: "allow_always" });
  });
});
