import type {
  ApprovalRequest,
  PlatformReplyTarget,
  TurnResult,
} from "../../contracts";
import type { IFormatter } from "../../core/formatter";
import { toUserFacingErrorMessage } from "../../core/user-facing-error";

type WhatsAppClient = {
  sendMessage: (chatId: string, text: string) => Promise<unknown>;
};

export class WhatsAppReplies {
  constructor(
    private readonly client: WhatsAppClient,
    private readonly formatter: IFormatter,
  ) {}

  async postFinal(
    target: PlatformReplyTarget,
    result: TurnResult,
  ): Promise<void> {
    const text =
      result.collectedText.trim() || `Turn finished: ${result.stopReason}`;
    await this.sendText(target.channelId, text);
  }

  async postError(target: PlatformReplyTarget, error: unknown): Promise<void> {
    await this.sendText(
      target.channelId,
      `Error processing request: ${toMessage(error)}`,
    );
  }

  async postText(target: PlatformReplyTarget, text: string): Promise<void> {
    await this.sendText(target.channelId, text);
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
    await this.sendText(target.channelId, text);
  }

  private async sendText(chatId: string, text: string): Promise<void> {
    const chunks = this.formatter.format(text);
    for (const chunk of chunks) {
      await this.client.sendMessage(chatId, chunk);
    }
  }
}

function toMessage(error: unknown): string {
  return toUserFacingErrorMessage(error);
}
