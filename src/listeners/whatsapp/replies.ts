import type {
  ApprovalRequest,
  PlatformReplyTarget,
  TurnResult,
} from "../../core/types";
import { toUserFacingErrorMessage } from "../../core/user-facing-error";

type WhatsAppApiConfig = {
  access_token: string;
  phone_number_id: string;
};

export class WhatsAppReplies {
  constructor(private readonly config: WhatsAppApiConfig) {}

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
    const buttons = request.options.slice(0, 3).map((option) => ({
      type: "reply",
      reply: {
        id: JSON.stringify({
          requestId: request.requestId,
          optionId: option.optionId,
          action: "select",
        }),
        title: truncate(option.name, 20),
      },
    }));
    if (buttons.length === 0) {
      await this.sendText(
        target.channelId,
        "Approval required but no options were provided.",
      );
      return;
    }

    await this.sendPayload({
      messaging_product: "whatsapp",
      to: target.channelId,
      type: "interactive",
      interactive: {
        type: "button",
        body: {
          text: truncate(
            `Tool approval required: ${request.toolCall.title ?? "tool call"}`,
            1024,
          ),
        },
        action: { buttons },
      },
    });

    await this.sendText(
      target.channelId,
      'Reply "cancel" to reject this request.',
    );
  }

  async sendText(chatId: string, text: string): Promise<void> {
    await this.sendPayload({
      messaging_product: "whatsapp",
      to: chatId,
      type: "text",
      text: { body: truncate(text, 4096) },
    });
  }

  private async sendPayload(payload: Record<string, unknown>): Promise<void> {
    const url = `https://graph.facebook.com/v20.0/${this.config.phone_number_id}/messages`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(`WhatsApp API error ${res.status}: ${await res.text()}`);
    }
  }
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

function toMessage(error: unknown): string {
  return toUserFacingErrorMessage(error);
}
