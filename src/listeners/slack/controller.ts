import type { WebClient } from "@slack/web-api";
import type { IdAllowlist } from "../../contracts";
import type { CoreOrchestrator } from "../../core/orchestrator";
import { isAllowedByAllowlist } from "../../core/allowlist";
import { log } from "../../core/logger";
import { parseUserControlCommand } from "../../core/stop-command";
import { SlackActions } from "./actions";
import { buildSlackPlatformPrompt } from "./build-prompt";
import { slackEventsApiShouldIgnoreMissingMention } from "./mention-guard";
import { SlackReplies } from "./replies";

export type SlackSocketEvent = {
  ack?: (payload?: unknown) => Promise<void>;
  type?: string;
  body?: Record<string, unknown>;
};

export class SlackMessageController {
  private botUserId: string | undefined;
  private readonly conversationByChannelId = new Map<
    string,
    { is_im?: boolean }
  >();

  constructor(
    private readonly webClient: WebClient,
    private readonly botToken: string,
    private readonly allowlist: IdAllowlist,
    private readonly requireMention: boolean,
    private readonly replies: SlackReplies,
    private readonly actions: SlackActions,
    private readonly orchestrator: CoreOrchestrator,
  ) {}

  setBotUserId(userId: string): void {
    this.botUserId = userId.trim() || undefined;
  }

  async handleSlackEvent(event: SlackSocketEvent): Promise<void> {
    if (event.ack) {
      await event.ack();
    }

    if (event.type === "interactive" && event.body) {
      log.debug("received interactive event", { scope: "slack" });
      await this.actions.handleInteractive(event.body);
      return;
    }

    if (event.type !== "events_api" || !event.body) {
      return;
    }

    const slackChannelId = getSlackChannelId(event.body);
    if (
      slackChannelId &&
      !isAllowedByAllowlist(slackChannelId, this.allowlist)
    ) {
      log.info("ignoring message from disallowed channel", {
        scope: "slack",
        channelId: slackChannelId,
      });
      return;
    }

    if (
      await slackEventsApiShouldIgnoreMissingMention(event.body, {
        requireMention: this.requireMention,
        botUserId: this.botUserId,
        resolveConversation: async (channelId) =>
          await this.resolveConversation(channelId),
      })
    ) {
      log.info("ignoring message without bot mention", {
        scope: "slack",
        channelId: slackChannelId,
      });
      return;
    }

    const prompt = await buildSlackPlatformPrompt(
      event.body,
      this.webClient,
      this.botToken,
      this.botUserId,
    );
    if (!prompt) {
      return;
    }
    log.info("received message event", {
      scope: "slack",
      conversationKey: prompt.conversationKey,
      channelId: prompt.replyTarget.channelId,
    });

    const control = parseUserControlCommand(prompt.text);
    if (control === "cancel") {
      const { cancelled } = await this.orchestrator.cancelInFlight(
        prompt.conversationKey,
      );
      await this.replies.postText(
        prompt.replyTarget,
        cancelled
          ? "Cancellation sent for this thread (in-flight work and pending approvals)."
          : "Nothing to cancel for this thread yet.",
      );
      return;
    }

    if (control === "reset") {
      try {
        await this.orchestrator.resetConversation(
          prompt.conversationKey,
          prompt.replyTarget,
        );
        await this.replies.postText(
          prompt.replyTarget,
          "Started a fresh chat for this conversation.",
        );
      } catch (error) {
        await this.replies.postError(prompt.replyTarget, error);
      }
      return;
    }

    const messageTs = getSlackMessageTs(prompt.metadata);
    if (messageTs) {
      try {
        await this.replies.setProcessingReaction(
          prompt.replyTarget.channelId,
          messageTs,
          "add",
        );
      } catch (error) {
        log.warn("failed to add processing reaction", {
          scope: "slack",
          channelId: prompt.replyTarget.channelId,
          messageTs,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    try {
      const result = await this.orchestrator.enqueuePrompt(prompt, {
        onCompleted: async (turn) => {
          log.info("sending final reply", {
            scope: "slack",
            conversationKey: prompt.conversationKey,
            stopReason: turn.stopReason,
          });
          await this.replies.postFinal(prompt.replyTarget, turn);
        },
        onError: async (error) => {
          log.error("failed to process message", {
            scope: "slack",
            conversationKey: prompt.conversationKey,
            error: error instanceof Error ? error.message : String(error),
          });
          await this.replies.postError(prompt.replyTarget, error);
        },
      });
      if (result === undefined) {
        return;
      }
    } finally {
      if (messageTs) {
        try {
          await this.replies.setProcessingReaction(
            prompt.replyTarget.channelId,
            messageTs,
            "remove",
          );
        } catch (error) {
          log.warn("failed to remove processing reaction", {
            scope: "slack",
            channelId: prompt.replyTarget.channelId,
            messageTs,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }

  private async resolveConversation(
    channelId: string,
  ): Promise<{ is_im?: boolean } | undefined> {
    const cached = this.conversationByChannelId.get(channelId);
    if (cached) {
      return cached;
    }
    try {
      const response = (await this.webClient.conversations.info({
        channel: channelId,
      })) as { channel?: { is_im?: boolean } };
      const channel = response.channel;
      if (channel) {
        this.conversationByChannelId.set(channelId, channel);
      }
      return channel;
    } catch (error) {
      log.warn("failed to resolve slack conversation for mention gate", {
        scope: "slack",
        channelId,
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }
}

function getSlackMessageTs(
  metadata: Record<string, unknown>,
): string | undefined {
  const channelMeta = metadata.channelMeta as
    | { message?: { messageTs?: string } }
    | undefined;
  const messageTs = channelMeta?.message?.messageTs;
  if (typeof messageTs === "string" && messageTs.trim()) {
    return messageTs.trim();
  }
  return undefined;
}

function getSlackChannelId(body: Record<string, unknown>): string | undefined {
  const event = body.event as { channel?: unknown } | undefined;
  return typeof event?.channel === "string" ? event.channel : undefined;
}
