import type {
  ApprovalRequest,
  PlatformReplyTarget,
  TurnResult,
} from "../../contracts";
import { failSafe } from "../../core/fail-safe";
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
    await this.guard("post final reply", () =>
      this.sendText(target.channelId, text),
    );
  }

  async postError(target: PlatformReplyTarget, error: unknown): Promise<void> {
    await this.guard("post error reply", () =>
      this.sendText(
        target.channelId,
        `Error processing request: ${toMessage(error)}`,
      ),
    );
  }

  async postText(target: PlatformReplyTarget, text: string): Promise<void> {
    await this.guard("post text reply", () =>
      this.sendText(target.channelId, text),
    );
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
    await this.guard("post approval request", () =>
      this.sendText(target.channelId, text),
    );
  }

  private async sendText(chatId: string, text: string): Promise<void> {
    await this.client.sendMessage(chatId, this.formatter.format(text));
  }

  private async guard(action: string, fn: () => Promise<void>): Promise<void> {
    await failSafe({
      scope: "whatsapp",
      action,
      fn,
    });
  }
}

function toMessage(error: unknown): string {
  return toUserFacingErrorMessage(error);
}
