import { SocketModeClient } from "@slack/socket-mode";
import { WebClient } from "@slack/web-api";
import type { ApprovalService } from "../../core/approval-service";
import type { CoreOrchestrator } from "../../core/orchestrator";
import type { SessionRegistry } from "../../core/session-registry";
import type { IdAllowlist } from "../../contracts";
import { SlackActions } from "./actions";
import { SlackMessageController, type SlackSocketEvent } from "./controller";
import { SlackFormatter } from "./formatter";
import { SlackReplies } from "./replies";
import { log } from "../../core/logger";

export class SlackListener {
  private readonly socketClient: SocketModeClient;
  private readonly webClient: WebClient;
  private readonly token: string;
  private readonly allowlist: IdAllowlist;
  private readonly requireMention: boolean;
  private readonly replies: SlackReplies;
  private readonly actions: SlackActions;
  private readonly controller: SlackMessageController;

  constructor(input: {
    token: string;
    appToken: string;
    allowlist: IdAllowlist;
    requireMention: boolean;
    orchestrator: CoreOrchestrator;
    approvals: ApprovalService;
    sessions: SessionRegistry;
  }) {
    this.allowlist = input.allowlist;
    this.requireMention = input.requireMention;
    this.token = input.token;
    this.webClient = new WebClient(input.token);
    this.socketClient = new SocketModeClient({
      appToken: input.appToken,
    });
    this.replies = new SlackReplies(this.webClient, new SlackFormatter());
    this.actions = new SlackActions(input.approvals, this.replies);
    this.controller = new SlackMessageController(
      this.webClient,
      this.token,
      this.allowlist,
      input.requireMention,
      this.replies,
      this.actions,
      input.orchestrator,
    );

    this.socketClient.on("slack_event", async (event: SlackSocketEvent) => {
      await this.controller.handleSlackEvent(event);
    });

    input.approvals.subscribe(async (request) => {
      const binding = input.sessions.getBySessionId(request.sessionId);
      if (!binding || binding.replyTarget.platform !== "slack") {
        return;
      }
      log.info("posting approval request", {
        scope: "slack",
        sessionId: request.sessionId,
        requestId: request.requestId,
        optionCount: request.options.length,
      });
      await this.replies.postApproval(binding.replyTarget, request);
    });
  }

  async start(): Promise<void> {
    if (this.requireMention) {
      try {
        const auth = await this.webClient.auth.test();
        const userId =
          typeof auth.user_id === "string" ? auth.user_id.trim() : "";
        if (userId) {
          this.controller.setUserId(userId);
          log.info("resolved slack auth user for mention gate", {
            scope: "slack",
            userId,
          });
        } else {
          log.warn(
            "auth.test missing user_id; require_mention will not filter",
            {
              scope: "slack",
            },
          );
        }
      } catch (error) {
        log.warn("auth.test failed; require_mention will not filter", {
          scope: "slack",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    await this.socketClient.start();
    log.info("socket mode started", { scope: "slack" });
  }

  async stop(): Promise<void> {
    try {
      await this.socketClient.disconnect();
      log.info("socket mode stopped", { scope: "slack" });
    } catch (error) {
      log.warn("failed to stop socket mode cleanly", {
        scope: "slack",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
