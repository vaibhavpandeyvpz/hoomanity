/**
 * Cumulative `runContext.usage.totalTokens` from main chat turns plus summarizer runs.
 * Drives Recollect `shouldSummarize` and stays aligned with the CLI footer after scaling on compaction.
 */
export type SessionApiUsageBudget = {
  total: number;
};
