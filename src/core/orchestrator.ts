import type { AcpClient } from "./acp-client";
import type { ApprovalService } from "./approval-service";
import type { SessionRegistry } from "./session-registry";
import { isTurnQueueDroppedError, TurnQueue } from "./turn-queue";
import type {
  ConversationKey,
  PlatformPrompt,
  PlatformReplyTarget,
  TurnHooks,
  TurnResult,
} from "../contracts";
import { log } from "./logger";
import { getPlatformSystemPrompt } from "../prompts";

export class CoreOrchestrator {
  constructor(
    private readonly acpClient: AcpClient,
    private readonly sessionRegistry: SessionRegistry,
    private readonly approvals: ApprovalService,
    private readonly turnQueue: TurnQueue,
    private readonly defaultCwd: string,
  ) {}

  /**
   * Cancel an in-flight prompt for this conversation (if we know a session id).
   * Does not use the per-conversation queue so it can preempt a running turn.
   */
  async cancelInFlight(
    conversationKey: string,
  ): Promise<{ cancelled: boolean }> {
    const persisted = this.sessionRegistry.getPersisted(conversationKey);
    if (!persisted) {
      return { cancelled: false };
    }
    const { sessionId } = persisted;
    try {
      await this.acpClient.cancelSessionTurn(sessionId);
    } catch (error) {
      log.warn("session cancel failed", {
        scope: "orchestrator",
        conversationKey,
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    this.approvals.cancelForSession(sessionId);
    return { cancelled: true };
  }

  async resetConversation(
    conversationKey: ConversationKey,
    replyTarget: PlatformReplyTarget,
  ): Promise<{ sessionId: string }> {
    const previous = this.sessionRegistry.getPersisted(conversationKey);
    if (previous) {
      await this.cancelInFlight(conversationKey);
    }
    this.turnQueue.dropPending(conversationKey);

    const systemPrompt = await getPlatformSystemPrompt(replyTarget.platform);
    const sessionId = await this.acpClient.newSession(
      this.defaultCwd,
      [],
      systemPrompt,
    );
    this.sessionRegistry.upsert(
      conversationKey,
      sessionId,
      this.defaultCwd,
      replyTarget,
    );
    log.info("conversation reset", {
      scope: "orchestrator",
      conversationKey,
      previousSessionId: previous?.sessionId,
      sessionId,
    });
    return { sessionId };
  }

  async enqueuePrompt(
    prompt: PlatformPrompt,
    hooks: TurnHooks = {},
  ): Promise<TurnResult | undefined> {
    log.info("enqueue prompt", {
      scope: "orchestrator",
      platform: prompt.platform,
      conversationKey: prompt.conversationKey,
    });
    try {
      return await this.turnQueue.enqueue(prompt.conversationKey, async () => {
        const memory = this.sessionRegistry.getByConversation(
          prompt.conversationKey,
        );
        const persisted = memory
          ? undefined
          : this.sessionRegistry.getPersisted(prompt.conversationKey);
        const systemPrompt = await getPlatformSystemPrompt(prompt.platform);

        let sessionId: string;
        let cwd: string;

        if (memory) {
          sessionId = memory.sessionId;
          cwd = memory.cwd;
        } else if (persisted) {
          sessionId = persisted.sessionId;
          cwd = persisted.cwd;
          try {
            await this.acpClient.ensurePersistedSessionReady(
              sessionId,
              cwd,
              systemPrompt,
            );
          } catch (error) {
            log.warn("loadSession failed; starting new session", {
              scope: "orchestrator",
              conversationKey: prompt.conversationKey,
              sessionId,
              error: error instanceof Error ? error.message : String(error),
            });
            sessionId = await this.acpClient.newSession(
              this.defaultCwd,
              [],
              systemPrompt,
            );
            cwd = this.defaultCwd;
          }
        } else {
          sessionId = await this.acpClient.newSession(
            this.defaultCwd,
            [],
            systemPrompt,
          );
          cwd = this.defaultCwd;
        }

        log.info(memory ? "reusing session" : "session for turn", {
          scope: "orchestrator",
          conversationKey: prompt.conversationKey,
          sessionId,
        });

        this.sessionRegistry.upsert(
          prompt.conversationKey,
          sessionId,
          cwd,
          prompt.replyTarget,
        );

        let collectedText = "";
        const unsubscribe = this.acpClient.subscribe(async (event) => {
          if (event.sessionId !== sessionId) {
            return;
          }

          if (event.kind === "message_chunk") {
            collectedText += event.text;
          }

          if (hooks.onEvent) {
            await hooks.onEvent(event);
          }
        });

        try {
          const response = await this.acpClient.prompt({
            sessionId,
            text: prompt.text,
            metadataJson: JSON.stringify(prompt.metadata),
            attachments: prompt.attachments,
          });

          const result: TurnResult = {
            sessionId,
            stopReason: response.stopReason,
            response,
            collectedText,
          };

          if (hooks.onCompleted) {
            await hooks.onCompleted(result);
          }

          log.info("turn completed", {
            scope: "orchestrator",
            conversationKey: prompt.conversationKey,
            sessionId,
            stopReason: response.stopReason,
            responseLength: collectedText.length,
          });

          return result;
        } catch (error) {
          log.error("turn failed", {
            scope: "orchestrator",
            conversationKey: prompt.conversationKey,
            sessionId,
            error: error instanceof Error ? error.message : String(error),
          });
          if (hooks.onError) {
            await hooks.onError(error);
          }
          throw error;
        } finally {
          unsubscribe();
        }
      });
    } catch (error) {
      if (isTurnQueueDroppedError(error)) {
        log.info("prompt dropped after conversation reset", {
          scope: "orchestrator",
          conversationKey: prompt.conversationKey,
        });
        return undefined;
      }
      throw error;
    }
  }
}
