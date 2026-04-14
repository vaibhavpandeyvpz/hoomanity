import type { PermissionOption } from "@agentclientprotocol/sdk";
import type { ApprovalService } from "../../core/approval-service";
import { log } from "../../core/logger";

export type WhatsAppPendingApproval = {
  requestId: string;
  options: PermissionOption[];
};

export type ApprovalReplyIntent =
  | "approve_once"
  | "approve_always"
  | "reject"
  | "ignore";

export function parseApprovalReplyText(text: string): ApprovalReplyIntent {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return "ignore";
  if (["y", "yes", "ok", "allow"].includes(normalized)) return "approve_once";
  if (
    [
      "always",
      "allow always",
      "ya",
      "yes always",
      "approve always",
      "allow_every_time",
    ].includes(normalized)
  ) {
    return "approve_always";
  }
  if (["n", "no", "reject", "deny", "cancel"].includes(normalized)) {
    return "reject";
  }
  return "ignore";
}

export function resolveApprovalFromText(
  approvals: ApprovalService,
  pending: WhatsAppPendingApproval,
  text: string,
): boolean {
  const intent = parseApprovalReplyText(text);
  if (intent === "ignore") return false;

  if (intent === "reject") {
    const rejectOption =
      findOptionByKind(pending.options, "reject_once") ??
      findOptionByKind(pending.options, "reject_always");
    if (rejectOption) {
      return approvals.selectOption(pending.requestId, rejectOption.optionId);
    }
    return approvals.cancel(pending.requestId);
  }

  if (intent === "approve_always") {
    const allowAlways = findOptionByKind(pending.options, "allow_always");
    if (allowAlways) {
      return approvals.selectOption(pending.requestId, allowAlways.optionId);
    }
  }

  const allowOnce =
    findOptionByKind(pending.options, "allow_once") ?? pending.options[0];
  if (!allowOnce) {
    log.warn("no approval option available to select", {
      scope: "whatsapp",
      requestId: pending.requestId,
    });
    return approvals.cancel(pending.requestId);
  }
  return approvals.selectOption(pending.requestId, allowOnce.optionId);
}

function findOptionByKind(
  options: PermissionOption[],
  kind: string,
): PermissionOption | undefined {
  return options.find((option) => option.kind === kind);
}
