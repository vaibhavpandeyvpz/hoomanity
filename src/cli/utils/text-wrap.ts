/** Hard-wrap one paragraph into lines ≤ `width` (words first, then long tokens). */
export function wrapParagraph(paragraph: string, width: number): string[] {
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
