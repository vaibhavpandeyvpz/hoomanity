import type { Channel, ChannelType, ChannelMessage } from "./types.js";
import {
  formatApprovalMessageWithLlm,
  parseApprovalReplyWithLlm,
  type ApprovalReplyLabel,
} from "../engine/approval/approval-llm.js";
import type { AiSdkTextModel } from "../providers/types.js";
import type { McpApprovalChoice } from "../store/allowance.js";
import type { ToolCallStartInfo, ToolCallEndInfo } from "../engine/runner.js";

const APPROVAL_REPLY_TO_CHOICE: Partial<
  Record<ApprovalReplyLabel, McpApprovalChoice>
> = {
  y: "allow",
  ya: "allow_always",
  n: "deny",
};

export abstract class BaseChannel implements Channel {
  abstract readonly id: string;
  abstract readonly type: ChannelType;

  protected messageCallback:
    | ((message: ChannelMessage) => Promise<void>)
    | null = null;
  protected pendingApproval: {
    toolName: string;
    argsPreview: string;
    resolve: (choice: McpApprovalChoice) => void;
    approvalMessage: string;
  } | null = null;

  constructor(protected readonly model: AiSdkTextModel) {}

  abstract sendMessage(text: string): Promise<void>;

  async sendToolCall(_info: ToolCallStartInfo): Promise<void> {
    // Default implementation: do nothing or send a simple notification
  }

  async sendToolResult(_info: ToolCallEndInfo): Promise<void> {
    // Default implementation: do nothing or send a simple notification
  }

  async askApproval(
    toolName: string,
    argsPreview: string,
  ): Promise<McpApprovalChoice> {
    const trimmedArgs =
      argsPreview.length > 256
        ? argsPreview.slice(0, 253) + "..."
        : argsPreview;
    const approvalMessage = await formatApprovalMessageWithLlm(
      this.model,
      this.type,
      toolName,
      trimmedArgs,
    );

    await this.deliverApprovalPrompt(approvalMessage);

    return new Promise((resolve) => {
      this.pendingApproval = {
        toolName,
        argsPreview,
        resolve,
        approvalMessage,
      };
    });
  }

  /** Default: post the formatted approval text. Channels may override (e.g. WhatsApp uses a reaction). */
  protected async deliverApprovalPrompt(
    approvalMessage: string,
  ): Promise<void> {
    await this.sendMessage(approvalMessage);
  }

  /** Called after a pending tool approval is resolved (before the runner continues). */
  protected onApprovalResolved?(
    _choice: McpApprovalChoice,
  ): void | Promise<void>;

  onMessage(callback: (message: ChannelMessage) => Promise<void>): void {
    this.messageCallback = callback;
  }

  /**
   * Handle an incoming message.
   * If there's a pending approval, try to parse it with the LLM.
   */
  async handleIncomingMessage(message: ChannelMessage): Promise<void> {
    const text = message.text?.trim() ?? "";

    if (this.pendingApproval) {
      const result = await parseApprovalReplyWithLlm(
        this.model,
        text,
        this.pendingApproval.toolName,
        this.pendingApproval.approvalMessage,
      );
      const choice = APPROVAL_REPLY_TO_CHOICE[result];
      if (choice !== undefined) {
        const pending = this.pendingApproval;
        try {
          await Promise.resolve(this.onApprovalResolved?.(choice));
        } catch {
          /* best-effort; approval must still unblock */
        }
        pending.resolve(choice);
        this.pendingApproval = null;
        return;
      }
      // "na": treat as normal user message; keep approval pending
    }

    if (this.messageCallback) {
      await this.messageCallback(message);
    }
  }

  getMetadata(): unknown {
    return { channel: this.type };
  }
}
