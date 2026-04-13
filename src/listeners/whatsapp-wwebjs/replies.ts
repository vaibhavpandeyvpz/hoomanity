import type {
  ApprovalRequest,
  PlatformReplyTarget,
  TurnResult,
} from "../../core/types";
import { toUserFacingErrorMessage } from "../../core/user-facing-error";

type WwebjsClient = {
  sendMessage: (chatId: string, text: string) => Promise<unknown>;
};

export class WwebjsReplies {
  constructor(private readonly client: WwebjsClient) {}

  async postFinal(
    target: PlatformReplyTarget,
    result: TurnResult,
  ): Promise<void> {
    const text =
      result.collectedText.trim() || `Turn finished: ${result.stopReason}`;
    await this.client.sendMessage(target.channelId, text);
  }

  async postError(target: PlatformReplyTarget, error: unknown): Promise<void> {
    await this.client.sendMessage(
      target.channelId,
      `Error processing request: ${toMessage(error)}`,
    );
  }

  async postText(target: PlatformReplyTarget, text: string): Promise<void> {
    await this.client.sendMessage(target.channelId, text);
  }

  async postApproval(
    target: PlatformReplyTarget,
    request: ApprovalRequest,
  ): Promise<void> {
    const text = [
      `Tool approval required: ${request.toolCall.title ?? "tool call"}`,
      "",
      "Reply with:",
      "- yes / y to allow once",
      "- always to allow every time",
      "- no / n to reject",
    ].join("\n");
    await this.client.sendMessage(target.channelId, text);
  }
}

function toMessage(error: unknown): string {
  return toUserFacingErrorMessage(error);
}
