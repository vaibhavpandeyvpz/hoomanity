/**
 * When the session API usage budget (CLI footer) reaches this fraction of the resolved max context
 * size, Recollect's `shouldSummarize` gate returns true.
 */
export const RECOLLECT_DEFAULT_THRESHOLD = 0.75;

/** Generate a unique session ID based on the current timestamp. */
export function generateSessionId(): string {
  return `s_${Math.floor(Date.now() / 1000)}`;
}
