import { useEffect, useState } from "react";
import { Box, Text, useStdout } from "ink";

const DEFAULT_MAX_VISIBLE = 2;

/** Hard-wrap one paragraph into lines ≤ `width` (words first, then long tokens). */
function wrapParagraph(paragraph: string, width: number): string[] {
  const w = Math.max(8, width);
  const trimmed = paragraph.trimEnd();
  if (!trimmed) {
    return [""];
  }
  const words = trimmed.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    if (word.length > w) {
      if (cur) {
        lines.push(cur);
        cur = "";
      }
      for (let i = 0; i < word.length; i += w) {
        lines.push(word.slice(i, i + w));
      }
      continue;
    }
    if (!cur) {
      cur = word;
    } else if (cur.length + 1 + word.length <= w) {
      cur += ` ${word}`;
    } else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur) {
    lines.push(cur);
  }
  return lines;
}

/** Full reasoning buffer → wrapped lines (respects `\n` from the model). */
export function wrapReasoningToLines(full: string, width: number): string[] {
  const text = full.replace(/\r\n/g, "\n").replace(/\r/g, "").trimEnd();
  if (!text) {
    return [];
  }
  const segments = text.split("\n");
  const out: string[] = [];
  for (const seg of segments) {
    if (seg === "") {
      out.push("");
    } else {
      out.push(...wrapParagraph(seg, width));
    }
  }
  return out;
}

type ReasoningStripProps = {
  readonly text: string;
  /** How many wrapped lines to show (tail = vertical scroll). */
  readonly maxVisibleLines?: number;
};

/**
 * Muted reasoning under the agent name: word-wrapped to terminal width, only the last
 * `maxVisibleLines` rows kept so long streams scroll upward.
 */
export function ReasoningStrip({
  text,
  maxVisibleLines = DEFAULT_MAX_VISIBLE,
}: ReasoningStripProps) {
  const { stdout } = useStdout();
  const [cols, setCols] = useState(() => Math.max(40, stdout?.columns ?? 80));

  useEffect(() => {
    const c = stdout;
    if (!c) {
      return;
    }
    const sync = () => setCols(Math.max(40, c.columns ?? 80));
    sync();
    c.on("resize", sync);
    return () => {
      c.off("resize", sync);
    };
  }, [stdout]);

  const allLines = wrapReasoningToLines(text, cols);
  if (allLines.length === 0) {
    return null;
  }

  const visible = allLines.slice(-maxVisibleLines);

  return (
    <Box flexDirection="column" width={cols}>
      {visible.map((line, i) => (
        <Text key={i} dimColor wrap="wrap">
          {line || " "}
        </Text>
      ))}
    </Box>
  );
}
