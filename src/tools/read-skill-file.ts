import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { tool, type Tool } from "@openai/agents";
import { z } from "zod";
import { syntheticToolFailureOutput } from "../agents/synthetic-tool-result.js";
import { agentSkillsDir } from "../utils/path-helpers.js";

const readSkillFileParameters = z.object({
  skill_folder: z
    .string()
    .min(1)
    .describe(
      "Skill directory name as shown in the list (e.g. `my-skill`), not a path.",
    ),
});

function assertSafeSkillFolder(name: string): string {
  const t = name.trim();
  if (!t) {
    throw new Error("skill_folder must be a non-empty skill directory name.");
  }
  if (t.includes("..") || t.includes("/") || t.includes("\\")) {
    throw new Error(
      "skill_folder must be a single directory name (no paths or parent segments).",
    );
  }
  return t;
}

function skillMdPath(agentId: string, skillFolder: string): string {
  return join(agentSkillsDir(agentId), skillFolder, "SKILL.md");
}

async function readSkillMdFile(
  agentId: string,
  skillFolder: string,
): Promise<string> {
  const folder = assertSafeSkillFolder(skillFolder);
  const path = skillMdPath(agentId, folder);
  try {
    return await readFile(path, "utf8");
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      throw new Error(
        `SKILL.md not found for skill folder "${folder}". Expected skills/${folder}/SKILL.md under this agent.`,
      );
    }
    throw e;
  }
}

export type CreateReadSkillFileToolOptions = {
  readonly timeoutMs?: number;
};

/**
 * Reads the full `SKILL.md` for a skill folder under the agent’s skill roots
 * (same layout as the “Available skills” appendix in instructions).
 */
export function createReadSkillFileTool(
  agentId: string,
  options?: CreateReadSkillFileToolOptions,
): Tool {
  const id = agentId.toUpperCase();
  return tool({
    name: "read_skill_file",
    description:
      "Load the complete SKILL.md for a local skill. Use when the excerpt in instructions is not enough to follow the skill. Argument is the skill folder name from the Available skills list.",
    parameters: readSkillFileParameters,
    strict: true,
    execute: async (input) => {
      try {
        return await readSkillMdFile(id, input.skill_folder);
      } catch (err) {
        return syntheticToolFailureOutput("read_skill_file", err);
      }
    },
    timeoutMs: options?.timeoutMs,
  });
}
