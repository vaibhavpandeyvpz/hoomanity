import type { ApprovalService } from "../../core/approval-service";
import type { SlackReplies } from "./replies";

type SlackActionPayload = {
  type?: string;
  actions?: Array<{
    action_id?: string;
    value?: string;
  }>;
};

export class SlackActions {
  constructor(
    private readonly approvals: ApprovalService,
    private readonly replies: SlackReplies,
  ) {}

  async handleInteractive(body: SlackActionPayload): Promise<void> {
    if (
      body.type !== "block_actions" ||
      !body.actions ||
      body.actions.length === 0
    ) {
      return;
    }

    const action = body.actions[0];
    if (!action.action_id || !action.value) {
      return;
    }

    const decoded = parseActionValue(action.value);
    if (!decoded?.requestId) {
      return;
    }

    if (action.action_id.startsWith("approval_select") && decoded.optionId) {
      const resolved = this.approvals.selectOption(
        decoded.requestId,
        decoded.optionId,
      );
      if (resolved) {
        await this.replies.markApprovalResolved(
          decoded.requestId,
          decoded.optionId,
        );
      }
      return;
    }

    if (action.action_id === "approval_cancel") {
      const resolved = this.approvals.cancel(decoded.requestId);
      if (resolved) {
        await this.replies.markApprovalResolved(decoded.requestId, "cancelled");
      }
    }
  }
}

function parseActionValue(
  value: string,
): { requestId?: string; optionId?: string } | undefined {
  try {
    return JSON.parse(value) as { requestId?: string; optionId?: string };
  } catch {
    return undefined;
  }
}
