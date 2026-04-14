import type {
  PermissionOption,
  RequestPermissionOutcome,
  ToolCallUpdate,
} from "@agentclientprotocol/sdk";

export type ApprovalRequest = {
  requestId: string;
  sessionId: string;
  toolCall: ToolCallUpdate;
  options: PermissionOption[];
};

export type ApprovalDecision = {
  requestId: string;
  outcome: RequestPermissionOutcome;
};
