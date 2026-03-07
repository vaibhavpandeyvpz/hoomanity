import { spawn } from "child_process";
import { readdir, readFile, writeFile, mkdir, mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { homedir, tmpdir } from "os";
import matter from "gray-matter";
import { env } from "../../env.js";

const PROJECT_ROOT = env.SKILLS_CWD;

/** Default agent for skills (user requested "amp"). */
const SKILLS_AGENT = "amp";

/** Project-local skills dir: list and read from <project>/.agents/skills/<skill-name>. */
const PROJECT_SKILLS_DIR = join(PROJECT_ROOT, ".agents", "skills");

export interface SkillEntry {
  id: string;
  name: string;
  description?: string;
}

export interface SkillsRunResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

const SKILL_MD = "SKILL.md";

/**
 * Parse name and description from a SKILL.md file's YAML frontmatter.
 */
function parseSkillFrontmatter(
  content: string,
  dirName: string,
): { name: string; description?: string } {
  try {
    const { data } = matter(content);
    const name =
      typeof data?.name === "string" && data.name.trim()
        ? data.name.trim()
        : dirName;
    const description =
      typeof data?.description === "string" && data.description.trim()
        ? data.description.trim()
        : undefined;
    return { name, description };
  } catch {
    return { name: dirName };
  }
}

/**
 * List installed skills by reading the project .agents/skills dir and parsing each skill's SKILL.md frontmatter (name, description).
 */
export async function listSkillsFromFs(): Promise<SkillEntry[]> {
  try {
    const entries = await readdir(PROJECT_SKILLS_DIR, { withFileTypes: true });
    const dirs = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

    const results: SkillEntry[] = [];
    for (const id of dirs) {
      const skillPath = join(PROJECT_SKILLS_DIR, id, SKILL_MD);
      try {
        const raw = await readFile(skillPath, "utf-8");
        const { name, description } = parseSkillFrontmatter(raw, id);
        results.push({ id, name, description });
      } catch {
        results.push({ id, name: id });
      }
    }
    return results;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") return [];
    throw err;
  }
}

/** Safe skill id for path (no path traversal). */
function isSafeSkillId(id: string): boolean {
  return /^[a-zA-Z0-9_.-]+$/.test(id) && id.length > 0 && id.length <= 200;
}

/** Valid slug for uploaded skill: lowercase alphanumeric and hyphens only. */
function isSlug(id: string): boolean {
  return (
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) && id.length > 0 && id.length <= 200
  );
}

/** Slugify frontmatter name for use as folder id: lowercase, alnum + hyphens. */
function slugifyName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "skill";
}

/**
 * Create or overwrite a skill from uploaded .md content using the CLI local-path install
 * so the skill is linked to the agent (amp) and recorded in skills-lock.json.
 * Parses frontmatter for `name`, slugifies it, builds a temp dir structure
 * <temp>/<id>/SKILL.md, runs `npx skills add <temp> -a amp --yes`, then removes the temp dir.
 */
export async function uploadSkill(
  content: string,
): Promise<{ path: string; id: string }> {
  const parsed = matter(content);
  const name =
    typeof parsed.data?.name === "string" && parsed.data.name.trim()
      ? parsed.data.name.trim()
      : "";
  if (!name) {
    throw new Error(
      "SKILL.md must have a `name` field in the frontmatter (e.g. name: my-skill).",
    );
  }

  const id = slugifyName(name);
  if (!isSlug(id)) {
    throw new Error(
      "Frontmatter `name` must be slugifiable to lowercase letters, numbers, and hyphens only.",
    );
  }

  const tempDir = await mkdtemp(join(tmpdir(), "hooman-skill-"));
  try {
    const skillDir = join(tempDir, id);
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, SKILL_MD), content, "utf-8");
    const result = await runSkills(
      ["add", tempDir, "-a", SKILLS_AGENT, "--yes"],
      { cwd: PROJECT_ROOT },
    );
    if (result.code !== 0) {
      const msg =
        result.stderr.trim() || result.stdout.trim() || "Unknown error";
      throw new Error(`Skills CLI failed: ${msg}`);
    }
    const path = join(PROJECT_SKILLS_DIR, id, SKILL_MD);
    return { path, id };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

/**
 * Read SKILL.md content for a skill by id, with frontmatter (name/description) stripped for display.
 * Returns null if not found or invalid id.
 */
export async function getSkillContent(skillId: string): Promise<string | null> {
  if (!isSafeSkillId(skillId)) return null;
  try {
    const path = join(PROJECT_SKILLS_DIR, skillId, SKILL_MD);
    const raw = await readFile(path, "utf-8");
    const { content } = matter(raw);
    return typeof content === "string" ? content.trim() : "";
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") return null;
    throw err;
  }
}

/**
 * Ensure the path the skills CLI uses to detect "amp" as installed exists
 * (~/.config/amp or $XDG_CONFIG_HOME/amp), so "npx skills ls -a amp" shows skills as linked.
 */
async function ensureAmpDetected(): Promise<void> {
  const configHome =
    process.env.XDG_CONFIG_HOME?.trim() || join(homedir(), ".config");
  const ampDir = join(configHome, "amp");
  await mkdir(ampDir, { recursive: true });
}

/**
 * Run npx skills with args. Uses project root as cwd and AGENTS_HOME so installs go to project .agents/skills.
 * Ensures amp is detected as installed so skills show as "linked" in `npx skills ls -a amp`.
 */
export async function runSkills(
  args: string[],
  options?: { cwd?: string },
): Promise<SkillsRunResult> {
  await ensureAmpDetected();
  const cwd = options?.cwd ?? PROJECT_ROOT;
  const agentsHome = join(cwd, ".agents");

  return new Promise((resolve) => {
    const proc = spawn("npx", ["skills", ...args], {
      cwd,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, AGENTS_HOME: agentsHome },
    });

    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on("close", (code) => {
      resolve({ stdout, stderr, code: code ?? null });
    });
    proc.on("error", (err) => {
      stderr += (err as Error).message;
      resolve({ stdout, stderr, code: 1 });
    });
  });
}

/** Add a skill package to project .agents/skills. skills => --skill x --skill y, -y non-interactive */
export async function addSkill(options: {
  package: string;
  skills?: string[];
}): Promise<SkillsRunResult> {
  const args = ["add", options.package.trim(), "-a", SKILLS_AGENT, "--yes"];
  for (const s of options.skills ?? []) {
    const t = String(s).trim();
    if (t) args.push("--skill", t);
  }
  return runSkills(args);
}

/** Remove installed skills by name from project .agents/skills. --yes skips confirmation. Do not pass -a: with -a amp the CLI only unlinks from that agent and does not delete the folder when other agents (e.g. Codex, Cursor) share .agents/skills. */
export async function removeSkills(
  skillNames: string[],
): Promise<SkillsRunResult> {
  if (skillNames.length === 0) {
    return { stdout: "", stderr: "No skills specified.", code: 1 };
  }

  const args = [
    "remove",
    ...skillNames.map((s) => s.trim()).filter(Boolean),
    "--yes",
  ];
  return runSkills(args);
}
