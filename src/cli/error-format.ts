/**
 * Short, single-line summary for Ink UI (`Error.message` or `String(unknown)`).
 * For full diagnostics (stack, causes) use {@link formatCaughtException} in `engine/synthetic-tool-result.js`.
 */
export function formatCliErrorBrief(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
