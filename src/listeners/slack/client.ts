import type { McpServer } from "@agentclientprotocol/sdk";
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
  private readonly replies: SlackReplies;
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
    this.token = input.token;
    this.webClient = new WebClient(input.token);
    this.socketClient = new SocketModeClient({
      appToken: input.appToken,
    });
    this.replies = new SlackReplies(this.webClient, new SlackFormatter());
    const actions = new SlackActions(input.approvals, this.replies);
    this.controller = new SlackMessageController(
      this.webClient,
      this.token,
      input.allowlist,
      input.requireMention,
      this.replies,
      actions,
      input.orchestrator,
    );

    this.socketClient.on("slack_event", (event: SlackSocketEvent) => {
      void this.controller.handleSlackEvent(event).catch((error: unknown) => {
        log.error("event handling failed", {
          scope: "slack",
          error: error instanceof Error ? error.message : String(error),
        });
      });
    });

    input.approvals.subscribe((request) => {
      void (async () => {
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
      })().catch((error: unknown) => {
        log.error("approval handling failed", {
          scope: "slack",
          error: error instanceof Error ? error.message : String(error),
        });
      });
    });
  }

  mcpServers(): McpServer[] {
    const env = [
      { name: "SLACK_MCP_MARK_TOOL", value: "1" },
      {
        name: "SLACK_MCP_ENABLED_TOOLS",
        value: [
          "attachment_get_data",
          "channels_list",
          "conversations_add_message",
          "conversations_history",
          "conversations_replies",
          "conversations_search_messages",
          "conversations_unreads",
          "reactions_add",
          "reactions_remove",
          "users_search",
          "usergroups_list",
          "usergroups_me",
        ].join(","),
      },
      this.token.startsWith("xoxp-")
        ? { name: "SLACK_MCP_XOXP_TOKEN", value: this.token }
        : { name: "SLACK_MCP_XOXB_TOKEN", value: this.token },
    ];
    return [
      {
        name: "_default_slack",
        command: "npx",
        args: ["-y", "slack-mcp-server", "--transport", "stdio"],
        env,
      },
    ];
  }

  async start(): Promise<void> {
    try {
      const auth = await this.webClient.auth.test();
      const id = typeof auth.user_id === "string" ? auth.user_id.trim() : "";
      if (id) {
        const username =
          typeof auth.user === "string" && auth.user.trim()
            ? auth.user.trim()
            : null;
        this.controller.setBotIdentity({ id, username });
        log.info("resolved slack bot identity", {
          scope: "slack",
          userId: id,
          hasUsername: username != null,
        });
      } else {
        log.warn("auth.test missing user_id", {
          scope: "slack",
        });
      }
    } catch (error) {
      log.warn("auth.test failed", {
        scope: "slack",
        error: error instanceof Error ? error.message : String(error),
      });
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
