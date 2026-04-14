import type { ApprovalService } from "../../core/approval-service";
import { parseTelegramApprovalCallback } from "./build-prompt";

export function parseTelegramApprovalText(text: string): "cancel" | "ignore" {
  const normalized = text.trim().toLowerCase();
  if (["cancel", "no", "n", "reject", "deny"].includes(normalized)) {
    return "cancel";
  }
  return "ignore";
}

export class TelegramActions {
  constructor(private readonly approvals: ApprovalService) {}

  resolveCallback(data: string | undefined): boolean {
    const action = parseTelegramApprovalCallback(data);
    if (!action) {
      return false;
    }
    if (action.action === "cancel") {
      return this.approvals.cancel(action.requestId);
    }
    return false;
  }

  resolveCancelByRequestId(requestId: string): boolean {
    return this.approvals.cancel(requestId);
  }

  resolveSelection(requestId: string, optionId: string): boolean {
    return this.approvals.selectOption(requestId, optionId);
  }
}
