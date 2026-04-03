import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  searchSkillsAPI,
  type SearchSkill,
} from "./utils/search-skills-api.js";
import { agentDir, agentSkillsDir } from "../utils/path-helpers.js";

const execFileAsync = promisify(execFile);

/** Vercel `skills` CLI package; pinned range for reproducible installs. */
export const SKILLS_CLI_PACKAGE = "skills@latest";

const SKILLS_CLI = SKILLS_CLI_PACKAGE;
/** Agent target for `skills add/list` — OpenClaw layout → `agents/<id>/skills/`. */
export const SKILLS_CLI_AGENT_TARGET = "openclaw";

const SKILLS_AGENT = SKILLS_CLI_AGENT_TARGET;

const ANSI_RE = /\x1b\[[0-9;]*m/g;

function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}

type SkillsListJsonRow = {
  name: string;
  path: string;
  scope?: string;
  agents?: string[];
};

export type SkillListEntry = {
  /** Directory name under `skills/` (agent dir). */
  folder: string;
  /** Display title (skill `name` from SKILL.md) */
  title: string;
};

async function runNpxSkills(
  args: string[],
  options: { cwd?: string; timeout?: number } = {},
): Promise<{ stdout: string; stderr: string }> {
  const { cwd, timeout = 300_000 } = options;
  return execFileAsync("npx", ["--yes", SKILLS_CLI, ...args], {
    cwd,
    maxBuffer: 20 * 1024 * 1024,
    timeout,
    env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
  });
}

/**
 * Install / list / delete skills via the Vercel [`skills` CLI](https://github.com/vercel-labs/skills)
 * (`npx skills`), using OpenClaw scope under each agent directory (`./skills/`).
 */
export class SkillsRegistry {
  private async ensureAgentDir(agentId: string): Promise<string> {
    const dir = agentDir(agentId);
    await mkdir(dir, { recursive: true });
    return dir;
  }

  async list(agentId: string): Promise<SkillListEntry[]> {
    const cwd = await this.ensureAgentDir(agentId);
    let stdout: string;
    try {
      const r = await runNpxSkills(["list", "--json", "-a", SKILLS_AGENT], {
        cwd,
      });
      stdout = r.stdout;
    } catch (e) {
      const err = e as { stderr?: string; message?: string };
      const detail = err.stderr ?? err.message ?? String(e);
      throw new Error(
        `skills list failed. Is Node/npm available?\n${stripAnsi(detail)}`,
      );
    }
    const text = stdout.trim();
    if (!text) {
      return [];
    }
    let rows: SkillsListJsonRow[];
    try {
      rows = JSON.parse(text) as SkillsListJsonRow[];
    } catch {
      throw new Error(
        `Unexpected skills list output (expected JSON):\n${text.slice(0, 500)}`,
      );
    }
    if (!Array.isArray(rows)) {
      return [];
    }
    return rows.map((row) => {
      const folder = basename(row.path);
      return {
        folder,
        title: row.name?.trim() || folder,
      };
    });
  }

  /**
   * `skills add <source> -y -a openclaw --copy` — supports owner/repo, Git URLs with tree paths, local paths, etc.
   */
  async install(agentId: string, source: string): Promise<void> {
    const raw = source.trim();
    if (!raw) {
      throw new Error(
        "Enter a skill source (e.g. owner/repo or a GitHub URL).",
      );
    }
    const cwd = await this.ensureAgentDir(agentId);
    try {
      await runNpxSkills(["add", raw, "-y", "-a", SKILLS_AGENT, "--copy"], {
        cwd,
        timeout: 600_000,
      });
    } catch (e) {
      const err = e as { stderr?: string; stdout?: string; message?: string };
      const detail = stripAnsi(
        err.stderr || err.stdout || err.message || String(e),
      );
      throw new Error(`skills add failed:\n${detail}`);
    }
  }

  /**
   * Remove by on-disk folder name (basename of `path` from `skills list --json`).
   *
   * We do **not** pass `--agent` so removal matches the CLI’s universal layout behavior.
   */
  async delete(agentId: string, folder: string): Promise<void> {
    const safe = folder.trim();
    if (!safe || /[\\/]/.test(safe) || safe.includes("..")) {
      throw new Error("Invalid skill name.");
    }
    const cwd = await this.ensureAgentDir(agentId);
    try {
      await runNpxSkills(["remove", safe, "-y"], { cwd });
    } catch (e) {
      const err = e as { stderr?: string; stdout?: string; message?: string };
      const detail = stripAnsi(
        err.stderr || err.stdout || err.message || String(e),
      );
      throw new Error(`skills remove failed:\n${detail}`);
    }

    await rm(join(agentSkillsDir(agentId), safe), {
      recursive: true,
      force: true,
    }).catch(() => {});
  }

  /**
   * Search the public catalog at skills.sh (same API as the `skills` CLI `find` command).
   */
  async searchCatalog(query: string): Promise<SearchSkill[]> {
    const q = query.trim();
    if (!q) {
      throw new Error("Enter a search term for the skills catalog.");
    }
    if (q.length < 2) {
      throw new Error("Use at least 2 characters to search.");
    }
    return searchSkillsAPI(q);
  }
}
