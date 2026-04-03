/** Fixed session id until multi-session UI exists. */
export const RECOLLECT_DEFAULT_SESSION_ID = "main";

/**
 * When the session API usage budget (CLI footer) reaches this fraction of the resolved max context
 * size, Recollect’s `shouldSummarize` gate returns true.
 */
export const RECOLLECT_DEFAULT_THRESHOLD = 0.75;
