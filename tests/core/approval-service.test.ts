import { describe, expect, it } from "bun:test";
import { ApprovalService } from "../../src/core/approval-service";

describe("ApprovalService", () => {
  it("resolves with selected option after interactive decision", async () => {
    const service = new ApprovalService(2000);
    let capturedRequestId = "";

    service.subscribe((request) => {
      capturedRequestId = request.requestId;
      service.selectOption(request.requestId, request.options[0]!.optionId);
    });

    const outcome = await service.requestApproval({
      sessionId: "session-1",
      toolCall: {
        toolCallId: "tool-1",
        title: "write file",
        status: "pending",
        kind: "execute",
      },
      options: [
        {
          optionId: "allow_once",
          kind: "allow_once",
          name: "Allow once",
        },
      ],
    });

    expect(capturedRequestId.length).toBeGreaterThan(0);
    expect(outcome.outcome).toBe("selected");
    if (outcome.outcome === "selected") {
      expect(outcome.optionId).toBe("allow_once");
    }
  });
});
