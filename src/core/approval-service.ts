import type {
  PermissionOption,
  RequestPermissionOutcome,
  ToolCallUpdate,
} from "@agentclientprotocol/sdk";
import type { ApprovalRequest } from "./types";
import { log } from "./logger";

type PendingApproval = {
  sessionId: string;
  resolve: (outcome: RequestPermissionOutcome) => void;
  timeoutHandle: ReturnType<typeof setTimeout>;
};

type ApprovalSubscriber = (request: ApprovalRequest) => void | Promise<void>;

export class ApprovalService {
  private readonly pending = new Map<string, PendingApproval>();
  private readonly subscribers = new Set<ApprovalSubscriber>();

  constructor(private readonly timeoutMs: number) {}

  subscribe(listener: ApprovalSubscriber): () => void {
    this.subscribers.add(listener);
    return () => {
      this.subscribers.delete(listener);
    };
  }

  async requestApproval(input: {
    sessionId: string;
    toolCall: ToolCallUpdate;
    options: PermissionOption[];
  }): Promise<RequestPermissionOutcome> {
    const requestId = crypto.randomUUID();
    log("info", "approval", "approval request created", {
      requestId,
      sessionId: input.sessionId,
      optionCount: input.options.length,
      toolCallId: input.toolCall.toolCallId,
    });

    const outcomePromise = new Promise<RequestPermissionOutcome>((resolve) => {
      const timeoutHandle = setTimeout(() => {
        this.pending.delete(requestId);
        log("warn", "approval", "approval request timed out", {
          requestId,
          sessionId: input.sessionId,
        });
        resolve({ outcome: "cancelled" });
      }, this.timeoutMs);

      this.pending.set(requestId, {
        sessionId: input.sessionId,
        resolve,
        timeoutHandle,
      });
    });

    const request: ApprovalRequest = {
      requestId,
      sessionId: input.sessionId,
      toolCall: input.toolCall,
      options: input.options,
    };

    try {
      for (const subscriber of this.subscribers) {
        await subscriber(request);
      }
    } catch (error) {
      log("error", "approval", "approval dispatch failed, cancelling request", {
        requestId,
        sessionId: input.sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      this.cancel(requestId);
    }

    return outcomePromise;
  }

  selectOption(requestId: string, optionId: string): boolean {
    log("info", "approval", "approval option selected", {
      requestId,
      optionId,
    });
    return this.finish(requestId, {
      outcome: "selected",
      optionId,
    });
  }

  cancel(requestId: string): boolean {
    log("info", "approval", "approval cancelled", { requestId });
    return this.finish(requestId, { outcome: "cancelled" });
  }

  cancelForSession(sessionId: string): void {
    for (const [requestId, pending] of this.pending.entries()) {
      if (pending.sessionId === sessionId) {
        this.finish(requestId, { outcome: "cancelled" });
      }
    }
  }

  private finish(
    requestId: string,
    outcome: RequestPermissionOutcome,
  ): boolean {
    const pending = this.pending.get(requestId);
    if (!pending) {
      return false;
    }

    clearTimeout(pending.timeoutHandle);
    this.pending.delete(requestId);
    pending.resolve(outcome);
    return true;
  }
}
