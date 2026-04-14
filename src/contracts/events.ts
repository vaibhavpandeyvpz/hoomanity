import type {
  PromptResponse,
  SessionNotification,
  StopReason,
  ToolCallUpdate,
} from "@agentclientprotocol/sdk";

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
