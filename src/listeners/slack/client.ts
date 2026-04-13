import { SocketModeClient } from "@slack/socket-mode";
import { WebClient } from "@slack/web-api";
import type { ApprovalService } from "../../core/approval-service";
import type { IdAllowlist } from "../../core/allowlist";
import type { CoreOrchestrator } from "../../core/orchestrator";
import type { SessionRegistry } from "../../core/session-registry";
import { isAllowedByAllowlist } from "../../core/allowlist";
import { buildSlackPlatformPrompt } from "./build-prompt";
import { SlackActions } from "./actions";
import { SlackReplies } from "./replies";
import { log } from "../../core/logger";
import { parseUserControlCommand } from "../../core/stop-command";

type SlackSocketEvent = {
  ack?: (payload?: unknown) => Promise<void>;
  type?: string;
  body?: Record<string, unknown>;
};

export class SlackListener {
  private readonly socketClient: SocketModeClient;
  private readonly webClient: WebClient;
  private readonly botToken: string;
  private readonly allowlist: IdAllowlist;
  private readonly stopCommands: string[];
  private readonly replies: SlackReplies;
  private readonly actions: SlackActions;

  constructor(input: {
    botToken: string;
    appToken: string;
    allowlist: IdAllowlist;
    stopCommands: string[];
    orchestrator: CoreOrchestrator;
    approvals: ApprovalService;
    sessions: SessionRegistry;
  }) {
    this.allowlist = input.allowlist;
    this.stopCommands = input.stopCommands;
    this.botToken = input.botToken;
    this.webClient = new WebClient(input.botToken);
    this.socketClient = new SocketModeClient({
      appToken: input.appToken,
    });
    this.replies = new SlackReplies(this.webClient);
    this.actions = new SlackActions(input.approvals, this.replies);

    this.socketClient.on("slack_event", async (event: SlackSocketEvent) => {
      await this.handleSlackEvent(event, input.orchestrator);
    });

    input.approvals.subscribe(async (request) => {
      const binding = input.sessions.getBySessionId(request.sessionId);
      if (!binding || binding.replyTarget.platform !== "slack") {
        return;
      }
      log("info", "slack", "posting approval request", {
        sessionId: request.sessionId,
        requestId: request.requestId,
        optionCount: request.options.length,
      });
      await this.replies.postApproval(binding.replyTarget, request);
    });
  }

  async start(): Promise<void> {
    await this.socketClient.start();
    log("info", "slack", "socket mode started");
  }

  async stop(): Promise<void> {
    try {
      await this.socketClient.disconnect();
      log("info", "slack", "socket mode stopped");
    } catch (error) {
      log("warn", "slack", "failed to stop socket mode cleanly", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async handleSlackEvent(
    event: SlackSocketEvent,
    orchestrator: CoreOrchestrator,
  ): Promise<void> {
    if (event.ack) {
      await event.ack();
    }

    if (event.type === "interactive" && event.body) {
      log("debug", "slack", "received interactive event");
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
      log("info", "slack", "ignoring message from disallowed channel", {
        channelId: slackChannelId,
      });
      return;
    }

    const prompt = await buildSlackPlatformPrompt(
      event.body,
      this.webClient,
      this.botToken,
    );
    if (!prompt) {
      return;
    }
    log("info", "slack", "received message event", {
      conversationKey: prompt.conversationKey,
      channelId: prompt.replyTarget.channelId,
    });

    const control = parseUserControlCommand(prompt.text, this.stopCommands);
    if (control === "cancel") {
      const { cancelled } = await orchestrator.cancelInFlight(
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
        await orchestrator.resetConversation(
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
        log("warn", "slack", "failed to add processing reaction", {
          channelId: prompt.replyTarget.channelId,
          messageTs,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    try {
      const result = await orchestrator.enqueuePrompt(prompt, {
        onCompleted: async (turn) => {
          log("info", "slack", "sending final reply", {
            conversationKey: prompt.conversationKey,
            stopReason: turn.stopReason,
          });
          await this.replies.postFinal(prompt.replyTarget, turn);
        },
        onError: async (error) => {
          log("error", "slack", "failed to process message", {
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
          log("warn", "slack", "failed to remove processing reaction", {
            channelId: prompt.replyTarget.channelId,
            messageTs,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
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
