import type { AgentInputItem } from "@openai/agents";
import type { Session } from "@openai/agents";
import type { MemoryLayer } from "@one710/recollect";
import type { LlmProviderRegistry } from "../../providers/registry.js";
import type { AgentConfig } from "../types.js";
import type {
  CompactionNotifierRef,
  RecollectCompactionUiPayload,
} from "./compaction-notice.js";
import { RECOLLECT_DEFAULT_SESSION_ID } from "./constants.js";
import { createAgentMemoryLayer } from "./memory-layer.js";
import { sanitizeOrphanFunctionCallResults } from "../synthetic-tool-result.js";
import type { SessionApiUsageBudget } from "./session-api-usage-budget.js";

/**
 * {@link Session} backed by `@one710/recollect` compaction + JSONL persistence.
 */
export class RecollectSession implements Session {
  private readonly memory: MemoryLayer;
  private readonly sessionId: string;
  private readonly notifierRef: CompactionNotifierRef;
  private readonly usageBudget: SessionApiUsageBudget;

  constructor(
    memory: MemoryLayer,
    sessionId: string = RECOLLECT_DEFAULT_SESSION_ID,
    notifierRef?: CompactionNotifierRef,
    usageBudget?: SessionApiUsageBudget,
  ) {
    this.memory = memory;
    this.sessionId = sessionId;
    this.notifierRef = notifierRef ?? { current: null };
    this.usageBudget = usageBudget ?? { total: 0 };
  }

  /** Add main-turn `runContext.usage.totalTokens` (same signal as the CLI footer). */
  recordTurnUsage(delta: number): void {
    if (delta > 0) {
      this.usageBudget.total += delta;
    }
  }

  /** Current budget total; keep UI in sync after each update. */
  getRecordedApiUsageTotal(): number {
    return this.usageBudget.total;
  }

  /**
   * Receive Recollect compaction + summarizer API usage for UI (Ink, etc.).
   * Pass `null` to detach.
   */
  setCompactionNotify(
    handler: ((payload: RecollectCompactionUiPayload) => void) | null,
  ): void {
    this.notifierRef.current = handler;
  }

  async getSessionId(): Promise<string> {
    return this.sessionId;
  }

  async getItems(limit?: number): Promise<AgentInputItem[]> {
    const messages = await this.memory.getPromptMessages(this.sessionId);
    const sliced =
      limit === undefined || limit <= 0
        ? messages
        : messages.slice(Math.max(0, messages.length - limit));
    const cloned = sliced.map((m) => structuredClone(m) as AgentInputItem);
    return sanitizeOrphanFunctionCallResults(cloned);
  }

  async addItems(items: AgentInputItem[]): Promise<void> {
    if (items.length === 0) {
      return;
    }
    await this.memory.addMessages(
      this.sessionId,
      null,
      items as unknown as Record<string, unknown>[],
    );
  }

  async popItem(): Promise<AgentInputItem | undefined> {
    const messages = await this.memory.getMessages(this.sessionId);
    if (messages.length === 0) {
      return undefined;
    }
    const last = messages[messages.length - 1]!;
    await this.memory.clearSession(this.sessionId);
    if (messages.length > 1) {
      await this.memory.addMessages(
        this.sessionId,
        null,
        messages.slice(0, -1) as Record<string, unknown>[],
      );
    }
    return structuredClone(last) as AgentInputItem;
  }

  async clearSession(): Promise<void> {
    await this.memory.clearSession(this.sessionId);
  }

  async dispose(): Promise<void> {
    this.notifierRef.current = null;
    this.usageBudget.total = 0;
    await this.memory.dispose();
  }
}

export async function createRecollectSession(
  agentId: string,
  config: AgentConfig,
  llmRegistry: LlmProviderRegistry,
  sessionId: string = RECOLLECT_DEFAULT_SESSION_ID,
): Promise<RecollectSession> {
  const notifierRef: CompactionNotifierRef = { current: null };
  const usageBudget: SessionApiUsageBudget = { total: 0 };
  const memory = await createAgentMemoryLayer(
    agentId,
    config,
    llmRegistry,
    notifierRef,
    usageBudget,
  );
  return new RecollectSession(memory, sessionId, notifierRef, usageBudget);
}
