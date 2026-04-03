import { SkillsRegistry } from "../skills/registry.js";

/**
 * Default skill for new agents: `find-skills` from the Vercel [`skills` CLI](https://github.com/vercel-labs/skills)
 * repository (helps discover/install other skills).
 */
export const DEFAULT_NEW_AGENT_SKILL_SOURCE =
  "https://github.com/vercel-labs/skills/tree/main/skills/find-skills";

export async function installDefaultSkillForNewAgent(
  agentId: string,
): Promise<void> {
  const registry = new SkillsRegistry();
  await registry.install(agentId, DEFAULT_NEW_AGENT_SKILL_SOURCE);
}
