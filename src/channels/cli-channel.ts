import { BaseChannel } from "./base.js";
import type { ChannelType } from "./types.js";
import type { AiSdkTextModel } from "../providers/types.js";
import type { ToolCallStartInfo, ToolCallEndInfo } from "../engine/runner.js";

import type { McpApprovalChoice } from "../store/allowance.js";

export interface CliChannelOptions {
  onTextUpdate: (text: string) => void;
  /** Live reasoning/thinking under the agent name (ReasoningStrip). */
  onReasoningUpdate?: (reasoningSoFar: string) => void;
  onToolCallStart?: (info: ToolCallStartInfo) => void;
  onToolCallEnd?: (info: ToolCallEndInfo) => void;
  askApproval?: (
    toolName: string,
    argsPreview: string,
  ) => Promise<McpApprovalChoice>;
}

export class CliChannel extends BaseChannel {
  readonly id = "cli";
  readonly type: ChannelType = "cli";

  constructor(
    model: AiSdkTextModel,
    private readonly options: CliChannelOptions,
  ) {
    super(model);
  }

  async sendMessage(text: string): Promise<void> {
    this.options.onTextUpdate(text);
  }

  async sendReasoningUpdate(reasoningSoFar: string): Promise<void> {
    this.options.onReasoningUpdate?.(reasoningSoFar);
  }

  async sendToolCall(info: ToolCallStartInfo): Promise<void> {
    this.options.onToolCallStart?.(info);
  }

  async sendToolResult(info: ToolCallEndInfo): Promise<void> {
    this.options.onToolCallEnd?.(info);
  }

  async askApproval(
    toolName: string,
    argsPreview: string,
  ): Promise<McpApprovalChoice> {
    if (this.options.askApproval) {
      return this.options.askApproval(toolName, argsPreview);
    }
    return super.askApproval(toolName, argsPreview);
  }

  override getMetadata(): unknown {
    return { channel: "cli" };
  }
}
