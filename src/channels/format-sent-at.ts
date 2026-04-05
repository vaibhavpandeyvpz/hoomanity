/**
 * Human-readable local time on the server (Node default locale + system timezone).
 */
export function formatEpochMsLocal(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  });
}

export function formatUnixSecondsLocal(sec: number): string {
  return formatEpochMsLocal(sec * 1000);
}

/**
 * Slack event `ts` — seconds since epoch, often with a fractional part (string).
 */
export function formatSlackTsLocal(ts: string | undefined): string | undefined {
  if (ts == null || String(ts).trim() === "") {
    return undefined;
  }
  const seconds = parseFloat(String(ts));
  if (!Number.isFinite(seconds)) {
    return undefined;
  }
  return formatEpochMsLocal(seconds * 1000);
}
