import type { ToolCallStartInfo, ToolCallEndInfo } from "../engine/runner.js";
import type { McpApprovalChoice } from "../store/allowance.js";
import type * as ChannelInbound from "./channel-messages.js";

export type ChannelType = "cli" | "slack" | "whatsapp";

export type {
  ChannelAttachmentRef,
  ChannelMessage,
  Message,
  SlackMessage,
  SlackParentMessage,
  WhatsAppGroupMentionRef,
  WhatsAppMessage,
  WhatsAppParentMessage,
} from "./channel-messages.js";

export {
  isSlackChannelMessage,
  isStructuredChannelMessage,
  isWhatsAppChannelMessage,
} from "./channel-messages.js";

export interface Channel {
  readonly id: string;
  readonly type: ChannelType;

  /**
   * When true (default if omitted), assistant text is sent on each stream delta via
   * {@link sendMessage}. When false, the channel does not support streaming (e.g. Slack,
   * WhatsApp) and the runner sends only the final reply in one {@link sendMessage}.
   */
  readonly supportsStreaming?: boolean;

  /** Send a plain text message to the channel. */
  sendMessage(text: string): Promise<void>;

  /**
   * Streamed reasoning / thinking (separate from main assistant text).
   * {@link CliChannel} forwards this to the TUI; Slack/WhatsApp omit it so nothing is posted
   * while the model thinks. Pass `""` to clear when main output starts.
   */
  sendReasoningUpdate?(reasoningSoFar: string): Promise<void>;

  /**
   * Visual “working” hint on the user’s last inbound message (Slack `:eyes:`, WhatsApp `👀`).
   * Runner calls `add` at turn start and `remove` in `finally` (success, error, or cancel).
   */
  setProcessingIndicator?(action: "add" | "remove"): Promise<void>;

  /** Optional: Notify the channel that a tool call has started. */
  sendToolCall?(info: ToolCallStartInfo): Promise<void>;

  /** Optional: Notify the channel that a tool call has completed. */
  sendToolResult?(info: ToolCallEndInfo): Promise<void>;

  /**
   * Ask the user for approval to run a tool.
   * Implementation should use LLM to format/parse natural language if needed.
   */
  askApproval(
    toolName: string,
    argsPreview: string,
  ): Promise<McpApprovalChoice>;

  /**
   * Register a handler for inbound user messages. Used by Slack/WhatsApp bot adapters; the CLI
   * channel does not call this.
   */
  onMessage(
    callback: (message: ChannelInbound.ChannelMessage) => Promise<void>,
  ): void;

  /** Get channel-specific metadata to prepend to the user prompt. */
  getMetadata?(): unknown;

  /** Optional: Initialize/start the channel. */
  start?(): Promise<void>;

  /** Optional: Stop/cleanup the channel. */
  stop?(): Promise<void>;
}
