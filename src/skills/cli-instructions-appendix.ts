import { resolve } from "node:path";
import { loadPromptTemplate } from "../prompts/load-prompt.js";
import { agentDir } from "../utils/path-helpers.js";
import { SKILLS_CLI_AGENT_TARGET, SKILLS_CLI_PACKAGE } from "./registry.js";

/**
 * How to run the Vercel `skills` CLI for this agent.
 * Template: {@link ../prompts/skills-cli.md}.
 */
export async function buildSkillsCliInstructionsAppendix(
  agentId: string,
): Promise<string> {
  const cwd = resolve(agentDir(agentId));
  return loadPromptTemplate("skills-cli.md", {
    skills_cwd: cwd,
    skills_cli_agent_target: SKILLS_CLI_AGENT_TARGET,
    skills_cli_package: SKILLS_CLI_PACKAGE,
  });
}
