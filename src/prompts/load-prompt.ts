import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Matches `${word}` placeholders in prompt templates. */
const PLACEHOLDER_RE = /\$\{(\w+)\}/g;

/**
 * Replaces `${key}` substrings using `variables`. Unknown keys are left unchanged.
 */
export function expandPromptPlaceholders(
  template: string,
  variables: Record<string, string>,
): string {
  return template.replace(PLACEHOLDER_RE, (full, key: string) =>
    Object.prototype.hasOwnProperty.call(variables, key)
      ? variables[key]!
      : full,
  );
}

/**
 * Reads a UTF-8 file next to this module (e.g. `identity.md`) and expands placeholders.
 */
export async function loadPromptTemplate(
  fileName: string,
  variables: Record<string, string> = {},
): Promise<string> {
  const dir = dirname(fileURLToPath(import.meta.url));
  const path = join(dir, fileName);
  const raw = await readFile(path, "utf8");
  return expandPromptPlaceholders(raw, variables).trimEnd();
}
