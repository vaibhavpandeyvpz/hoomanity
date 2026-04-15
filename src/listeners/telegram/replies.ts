import { Markup, type Telegram } from "telegraf";
import type {
  ApprovalRequest,
  PlatformReplyTarget,
  TurnResult,
} from "../../contracts";
import { failSafe } from "../../core/fail-safe";
import type { IFormatter } from "../../core/formatter";
import { toUserFacingErrorMessage } from "../../core/user-facing-error";
import { telegramApprovalCallbackData } from "./build-prompt";

export class TelegramReplies {
  private readonly approvalMessageByRequestId = new Map<
    string,
    { chatId: string; messageId: number }
  >();

  constructor(
    private readonly telegram: Telegram,
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
        `Error processing request: ${toUserFacingErrorMessage(error)}`,
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
    await this.guard("post approval request", async () => {
      const buttons = request.options
        .slice(0, 3)
        .map((option, index) =>
          Markup.button.callback(
            truncate(option.name, 32),
            telegramApprovalCallbackData(request.requestId, index),
          ),
        );
      if (buttons.length === 0) {
        await this.sendText(
          target.channelId,
          "Approval required but no options were provided.",
        );
        return;
      }

      buttons.push(
        Markup.button.callback(
          "Cancel",
          telegramApprovalCallbackData(request.requestId, "cancel"),
        ),
      );

      const message = await this.telegram.sendMessage(
        target.channelId,
        this.formatOne(
          truncate(
            `Tool approval required: ${request.toolCall.title ?? "tool call"}`,
            4096,
          ),
        ),
        {
          ...Markup.inlineKeyboard(buttons, { columns: 1 }),
          parse_mode: "MarkdownV2",
        },
      );

      this.approvalMessageByRequestId.set(request.requestId, {
        chatId: target.channelId,
        messageId: message.message_id,
      });
    });
  }

  async markApprovalResolved(requestId: string, label: string): Promise<void> {
    const posted = this.approvalMessageByRequestId.get(requestId);
    if (!posted) {
      return;
    }
    await this.guard("mark approval resolved", async () => {
      await this.telegram.editMessageText(
        posted.chatId,
        posted.messageId,
        undefined,
        this.formatOne(`Approval resolved: ${label}`),
        { parse_mode: "MarkdownV2" },
      );
      this.approvalMessageByRequestId.delete(requestId);
    });
  }

  async sendText(chatId: string, text: string): Promise<void> {
    await this.telegram.sendMessage(
      chatId,
      this.formatOne(truncate(text, 4096)),
      { parse_mode: "MarkdownV2" },
    );
  }

  private formatOne(text: string): string {
    return this.formatter.format(text)[0] ?? text;
  }

  private async guard(action: string, fn: () => Promise<void>): Promise<void> {
    await failSafe({
      scope: "telegram",
      action,
      fn,
    });
  }
}

function truncate(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}
