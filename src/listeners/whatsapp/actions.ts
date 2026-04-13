import type { ApprovalService } from "../../core/approval-service";
import type {
  WhatsAppWebhookMessage,
  WhatsAppInteractiveApproval,
} from "./build-prompt";
import { parseInteractiveApprovalCallback } from "./build-prompt";

export function parseWhatsAppApprovalText(text: string): "cancel" | "ignore" {
  const normalized = text.trim().toLowerCase();
  if (["cancel", "no", "n", "reject", "deny"].includes(normalized))
    return "cancel";
  return "ignore";
}

export class WhatsAppActions {
  constructor(private readonly approvals: ApprovalService) {}

  resolveInteractive(message: WhatsAppWebhookMessage): boolean {
    const action = parseInteractiveApprovalCallback(message);
    if (!action) return false;
    return applyApprovalAction(this.approvals, action);
  }

  resolveCancelByRequestId(requestId: string): boolean {
    return this.approvals.cancel(requestId);
  }
}

function applyApprovalAction(
  approvals: ApprovalService,
  action: WhatsAppInteractiveApproval,
): boolean {
  if (action.action === "cancel") {
    return approvals.cancel(action.requestId);
  }
  if (!action.optionId) {
    return approvals.cancel(action.requestId);
  }
  return approvals.selectOption(action.requestId, action.optionId);
}
