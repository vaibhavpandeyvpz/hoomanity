import type { CompactionEvent } from "@one710/recollect";

/** UI + telemetry payload after a successful Recollect compaction pass. */
export type RecollectCompactionUiPayload = CompactionEvent & {
  summaryInputTokens: number | null;
  summaryOutputTokens: number | null;
  summaryTotalTokens: number | null;
};

export type CompactionNotifierRef = {
  current: ((payload: RecollectCompactionUiPayload) => void) | null;
};

function fmtTok(n: number): string {
  if (n >= 10_000) {
    return `${Math.round(n / 1000)}k`;
  }
  if (n >= 1000) {
    return `${(n / 1000).toFixed(1)}k`;
  }
  return `${n}`;
}

/** Single-line status for Ink (and similar). */
export function formatRecollectCompactionLine(
  p: RecollectCompactionUiPayload,
): string {
  const parts = [
    "Memory compacted",
    `est. ${fmtTok(p.beforeTokens)}→${fmtTok(p.afterTokens)} tok`,
    `${p.summarizedMessages} msgs summarized`,
  ];
  if (
    p.summaryInputTokens != null &&
    p.summaryOutputTokens != null &&
    (p.summaryInputTokens > 0 || p.summaryOutputTokens > 0)
  ) {
    parts.push(
      `summary ${fmtTok(p.summaryInputTokens)} in / ${fmtTok(p.summaryOutputTokens)} out`,
    );
  } else if (p.summaryTotalTokens != null && p.summaryTotalTokens > 0) {
    parts.push(`summary ${fmtTok(p.summaryTotalTokens)} tok`);
  }
  return parts.join(" · ");
}
