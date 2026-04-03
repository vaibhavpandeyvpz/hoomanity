import { createRequire } from "node:module";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { FrontMatterOptions, FrontMatterResult } from "front-matter";
import { agentSkillsDir } from "../utils/path-helpers.js";

const require = createRequire(import.meta.url);
const parseFrontMatter = require("front-matter") as <T>(
  str: string,
  options?: FrontMatterOptions,
) => FrontMatterResult<T>;

/** Typical SKILL.md YAML front matter (extra keys allowed). */
type SkillFrontMatter = {
  name?: string;
  description?: string;
  [key: string]: unknown;
};

function formatAttributeValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function bodyPreview(body: string, maxLines: number): string {
  const lines = body
    .trim()
    .split(/\r?\n/)
    .filter((l) => l.length > 0);
  return lines.slice(0, maxLines).join("\n").trim();
}

/**
 * Builds a prompt appendix from local SKILL.md files (YAML front matter via
 * {@link https://www.npmjs.com/package/front-matter front-matter}).
 */
export async function createSkillsPrompt(agentId: string): Promise<string> {
  const bases = [agentSkillsDir(agentId)];
  const seen = new Set<string>();
  const dirs: { base: string; name: string }[] = [];
  for (const base of bases) {
    let names: string[];
    try {
      names = await readdir(base, { withFileTypes: true }).then((entries) =>
        entries.filter((e) => e.isDirectory()).map((e) => e.name),
      );
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code === "ENOENT") {
        continue;
      }
      throw e;
    }
    for (const name of names) {
      if (seen.has(name)) {
        continue;
      }
      seen.add(name);
      dirs.push({ base, name });
    }
  }
  if (dirs.length === 0) {
    return "";
  }
  const parts: string[] = ["\n\n## Available skills (local)\n"];
  dirs.sort((a, b) => a.name.localeCompare(b.name));
  for (const { base, name: dir } of dirs) {
    const skillMd = join(base, dir, "SKILL.md");
    try {
      const text = await readFile(skillMd, "utf8");
      const parsed = parseFrontMatter<SkillFrontMatter>(text);
      const attrs = parsed.attributes;
      const title =
        typeof attrs.name === "string" && attrs.name.trim()
          ? attrs.name.trim()
          : dir;
      const description =
        typeof attrs.description === "string" && attrs.description.trim()
          ? attrs.description.trim()
          : "";
      const extraMeta: string[] = [];
      for (const [key, value] of Object.entries(attrs)) {
        if (key === "name" || key === "description") {
          continue;
        }
        if (value === undefined || value === null) {
          continue;
        }
        extraMeta.push(`  - ${key}: ${formatAttributeValue(value)}`);
      }
      const preview = bodyPreview(parsed.body, 10);
      const lines: string[] = [`- **${title}** (folder: \`${dir}\`)`];
      if (description) {
        lines.push(`  - description: ${description}`);
      }
      lines.push(...extraMeta);
      if (preview) {
        lines.push(
          `  - excerpt:\n${preview
            .split("\n")
            .map((l) => `    ${l}`)
            .join("\n")}`,
        );
      }
      parts.push(`${lines.join("\n")}\n`);
    } catch {
      parts.push(`- **${dir}** (SKILL.md missing or unreadable)\n`);
    }
  }
  return parts.join("\n");
}
