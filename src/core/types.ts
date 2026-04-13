import type {
  PermissionOption,
  PromptResponse,
  RequestPermissionOutcome,
  SessionNotification,
  StopReason,
  ToolCallUpdate,
} from "@agentclientprotocol/sdk";

export type ConversationKey = string;

export type PlatformName = "slack" | "whatsapp" | string;

export type PlatformReplyTarget = {
  platform: PlatformName;
  channelId: string;
  threadTs?: string;
};

/** Local file saved from Slack (or similar); used to build ACP prompt parts. */
export type StoredAttachment = {
  localPath: string;
  originalName: string;
  mimeType: string;
};

export type PlatformPrompt = {
  platform: PlatformName;
  conversationKey: ConversationKey;
  /** Combined user-visible text (e.g. raw Slack text + text extracted from blocks). */
  text: string;
  metadata: Record<string, unknown>;
  replyTarget: PlatformReplyTarget;
  receivedAt: number;
  /** Files on disk under ~/.hooman/attachments (images sent as image parts; others as path list). */
  attachments?: StoredAttachment[];
};

export type CoreEvent =
  | {
      kind: "message_chunk";
      sessionId: string;
      text: string;
      raw: SessionNotification;
    }
  | {
      kind: "tool_call";
      sessionId: string;
      toolCall: ToolCallUpdate;
      raw: SessionNotification;
    }
  | {
      kind: "tool_call_update";
      sessionId: string;
      toolCall: ToolCallUpdate;
      raw: SessionNotification;
    }
  | {
      kind: "session_update";
      sessionId: string;
      raw: SessionNotification;
    };

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

export type TurnResult = {
  sessionId: string;
  stopReason: StopReason;
  response: PromptResponse;
  collectedText: string;
};

export type TurnHooks = {
  onEvent?: (event: CoreEvent) => void | Promise<void>;
  onCompleted?: (result: TurnResult) => void | Promise<void>;
  onError?: (error: unknown) => void | Promise<void>;
};
