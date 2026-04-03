import { Box, Text } from "ink";

export type SessionStatusBarProps = {
  readonly agentName: string;
  readonly agentId: string;
  readonly modelLabel: string;
  /** Tokens used in the last completed turn (sum of in+out from API). */
  readonly lastTurnTokens: number | null;
  /** Cumulative tokens across turns in this session (sum of per-turn totals). */
  readonly sessionTokens: number;
  /** Estimated context window (tokens), or null if unknown. */
  readonly contextWindow: number | null;
  readonly elapsedRunningSec: number | null;
  readonly isRunning: boolean;
  /** Rough output tok/s while the model streams (char-based estimate). */
  readonly streamingOutputTpsEst: number | null;
};

const BAR_LEN = 14;
const MODEL_MAX_LEN = 30;

/** Show at most 30 characters, keeping the end (e.g. Bedrock ARN suffix). */
function truncateModelFromEnd(s: string): string {
  const t = s.trim();
  if (t.length <= MODEL_MAX_LEN) {
    return t;
  }
  return `…${t.slice(-(MODEL_MAX_LEN - 1))}`;
}

function pctCtxLeft(sessionTokens: number, window: number | null): string {
  if (window == null || window <= 0) {
    return "—";
  }
  const p = Math.min(100, Math.round((sessionTokens / window) * 100));
  return `${100 - p}% ctx left`;
}

function formatEstTps(tps: number): string {
  if (tps < 10) {
    return tps.toFixed(1);
  }
  return String(Math.round(tps));
}

function WorkingStatus({
  elapsedRunningSec,
  streamingOutputTpsEst,
}: {
  readonly elapsedRunningSec: number;
  readonly streamingOutputTpsEst: number | null;
}) {
  return (
    <Text color="yellow" dimColor wrap="truncate-end">
      ·{" "}
      <Text bold color="yellow">
        working
      </Text>{" "}
      {elapsedRunningSec}s
      {streamingOutputTpsEst != null ? (
        <>
          {" "}
          <Text dimColor>· ~{formatEstTps(streamingOutputTpsEst)} tok/s</Text>
        </>
      ) : null}
      {" · "}esc to leave
    </Text>
  );
}

/**
 * Compact two-line status — borderless and muted so the message input stays emphasized.
 */
export function SessionStatusBar({
  agentName,
  agentId,
  modelLabel,
  lastTurnTokens,
  sessionTokens,
  contextWindow,
  elapsedRunningSec,
  isRunning,
  streamingOutputTpsEst,
}: SessionStatusBarProps) {
  const filled =
    contextWindow != null && contextWindow > 0
      ? Math.min(
          BAR_LEN,
          Math.max(0, Math.round((sessionTokens / contextWindow) * BAR_LEN)),
        )
      : 0;
  const barStr =
    contextWindow != null
      ? `${"█".repeat(filled)}${"░".repeat(BAR_LEN - filled)}`
      : "─".repeat(BAR_LEN);

  const pctStr = pctCtxLeft(sessionTokens, contextWindow);
  const turnStr = lastTurnTokens != null ? String(lastTurnTokens) : "—";
  const modelShown = truncateModelFromEnd(modelLabel);

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box justifyContent="space-between" width="100%" flexDirection="row">
        <Box flexGrow={1} marginRight={1} minWidth={0}>
          <Text dimColor wrap="truncate-end">
            {agentName} [{agentId}] · {modelShown}
          </Text>
        </Box>
        {isRunning && elapsedRunningSec != null ? (
          <WorkingStatus
            elapsedRunningSec={elapsedRunningSec}
            streamingOutputTpsEst={streamingOutputTpsEst}
          />
        ) : (
          <Text dimColor wrap="truncate-end">
            · ready
          </Text>
        )}
      </Box>
      <Box width="100%">
        <Text dimColor wrap="truncate-end">
          turn {turnStr} · session {sessionTokens} · {barStr} {pctStr}
        </Text>
      </Box>
    </Box>
  );
}
