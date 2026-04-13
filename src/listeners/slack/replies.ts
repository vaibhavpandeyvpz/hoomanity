import type { WebClient } from "@slack/web-api";
import type {
  ApprovalRequest,
  PlatformReplyTarget,
  TurnResult,
} from "../../core/types";
import { toUserFacingErrorMessage } from "../../core/user-facing-error";

export class SlackReplies {
  private readonly approvalMessageByRequestId = new Map<
    string,
    { channel: string; ts: string }
  >();

  constructor(private readonly client: WebClient) {}

  async postFinal(
    target: PlatformReplyTarget,
    result: TurnResult,
  ): Promise<void> {
    const text =
      result.collectedText.trim() || `Turn finished: ${result.stopReason}`;
    await this.client.chat.postMessage({
      channel: target.channelId,
      thread_ts: target.threadTs,
      text,
    });
  }

  async postError(target: PlatformReplyTarget, error: unknown): Promise<void> {
    await this.client.chat.postMessage({
      channel: target.channelId,
      thread_ts: target.threadTs,
      text: `Error processing request: ${toMessage(error)}`,
    });
  }

  async postText(target: PlatformReplyTarget, text: string): Promise<void> {
    await this.client.chat.postMessage({
      channel: target.channelId,
      thread_ts: target.threadTs,
      text,
    });
  }

  async setProcessingReaction(
    channelId: string,
    messageTs: string,
    action: "add" | "remove",
  ): Promise<void> {
    try {
      if (action === "add") {
        await this.client.reactions.add({
          channel: channelId,
          timestamp: messageTs,
          name: "eyes",
        });
      } else {
        await this.client.reactions.remove({
          channel: channelId,
          timestamp: messageTs,
          name: "eyes",
        });
      }
    } catch (error) {
      const code = (error as { data?: { error?: string } })?.data?.error;
      if (action === "add" && code === "already_reacted") return;
      if (action === "remove" && code === "no_reaction") return;
      throw error;
    }
  }

  async postApproval(
    target: PlatformReplyTarget,
    request: ApprovalRequest,
  ): Promise<void> {
    const text = `Tool approval required: ${request.toolCall.title}`;
    const response = await this.client.chat.postMessage({
      channel: target.channelId,
      thread_ts: target.threadTs,
      text,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Tool approval required*\n${request.toolCall.title}`,
          },
        },
        {
          type: "actions",
          elements: request.options.map((option, index) => ({
            type: "button",
            text: {
              type: "plain_text",
              text: option.name,
            },
            action_id: `approval_select_${index}`,
            value: JSON.stringify({
              requestId: request.requestId,
              optionId: option.optionId,
            }),
          })),
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              style: "danger",
              text: {
                type: "plain_text",
                text: "Cancel",
              },
              action_id: "approval_cancel",
              value: JSON.stringify({
                requestId: request.requestId,
              }),
            },
          ],
        },
      ],
    });

    if (response.ts) {
      this.approvalMessageByRequestId.set(request.requestId, {
        channel: target.channelId,
        ts: response.ts,
      });
    }
  }

  async markApprovalResolved(requestId: string, label: string): Promise<void> {
    const posted = this.approvalMessageByRequestId.get(requestId);
    if (!posted) {
      return;
    }

    await this.client.chat.update({
      channel: posted.channel,
      ts: posted.ts,
      text: `Approval resolved: ${label}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `Approval resolved: *${label}*`,
          },
        },
      ],
    });
  }
}

function toMessage(error: unknown): string {
  return toUserFacingErrorMessage(error);
}
