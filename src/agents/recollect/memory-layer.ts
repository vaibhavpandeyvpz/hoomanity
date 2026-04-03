import {
  FilesystemStorageAdapter,
  MemoryLayer,
  type CompactionEvent,
  type SummaryRequest,
} from "@one710/recollect";
import { Agent, Runner, extractAllTextOutput } from "@openai/agents";
import { create as createLlmModel } from "../../providers/factory.js";
import type { LlmProviderRegistry } from "../../providers/registry.js";
import { agentRecollectSessionsRoot } from "../../utils/path-helpers.js";
import type { AgentConfig } from "../types.js";
import { resolvedMaxContextTokens } from "../timeouts.js";
import type { CompactionNotifierRef } from "./compaction-notice.js";
import { RECOLLECT_DEFAULT_THRESHOLD } from "./constants.js";
import { renderMessageForSummary } from "./render-message.js";
import type { SessionApiUsageBudget } from "./session-api-usage-budget.js";

/**
 * Recollect {@link MemoryLayer} with filesystem JSONL under
 * `~/.hoomanity/agents/<agentId>/sessions/<sessionId>/messages.jsonl` (plus events/stats).
 */
type PendingSummaryUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export async function createAgentMemoryLayer(
  agentId: string,
  config: AgentConfig,
  llmRegistry: LlmProviderRegistry,
  notifierRef: CompactionNotifierRef,
  usageBudget: SessionApiUsageBudget,
): Promise<MemoryLayer> {
  const rootDir = agentRecollectSessionsRoot(agentId);
  const storage = new FilesystemStorageAdapter(rootDir);
  await storage.init();
  const maxContext = resolvedMaxContextTokens(config);
  const summarizeThresholdTokens = Math.max(
    1,
    Math.floor(maxContext * RECOLLECT_DEFAULT_THRESHOLD),
  );
  const shouldSummarize = (_messages: Record<string, unknown>[]): boolean =>
    usageBudget.total >= summarizeThresholdTokens;
  const model = createLlmModel(llmRegistry, config);
  const summarizeRunner = new Runner({ tracingDisabled: true });
  let pendingSummaryUsage: PendingSummaryUsage | null = null;
  const summarize = async (input: SummaryRequest): Promise<string> => {
    pendingSummaryUsage = null;
    const agent = new Agent({
      name: "recollect-summarizer",
      instructions: input.instructions,
      model,
    });
    const result = await summarizeRunner.run(agent, input.summaryPrompt, {
      maxTurns: 2,
    });
    const u = result.runContext.usage;
    pendingSummaryUsage = {
      inputTokens: u.inputTokens,
      outputTokens: u.outputTokens,
      totalTokens: u.totalTokens,
    };
    const direct = result.finalOutput;
    if (typeof direct === "string" && direct.length > 0) {
      return direct;
    }
    return extractAllTextOutput(result.newItems);
  };
  const onCompactionEvent = (event: CompactionEvent): void => {
    const before = Math.max(1, event.beforeTokens);
    usageBudget.total = Math.floor(
      usageBudget.total * (event.afterTokens / before),
    );
    const u = pendingSummaryUsage;
    pendingSummaryUsage = null;
    if (u && u.totalTokens > 0) {
      usageBudget.total += u.totalTokens;
    }
    notifierRef.current?.({
      ...event,
      summaryInputTokens: u?.inputTokens ?? null,
      summaryOutputTokens: u?.outputTokens ?? null,
      summaryTotalTokens: u?.totalTokens ?? null,
    });
  };
  return new MemoryLayer({
    shouldSummarize,
    summarize,
    renderMessage: renderMessageForSummary,
    storage,
    onCompactionEvent,
    keepRecentUserTurns: 1,
    keepRecentMessagesMin: 1,
  });
}
