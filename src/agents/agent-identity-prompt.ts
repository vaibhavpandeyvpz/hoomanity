import { loadPromptTemplate } from "../prompts/load-prompt.js";

/**
 * System-instruction appendix: this agent's identity in hooman (agent id + display name).
 * Template: {@link ../prompts/identity.md}.
 */
export async function buildAgentIdentityInstructionsAppendix(input: {
  agentId: string;
  displayName: string;
}): Promise<string> {
  const name = input.displayName.trim() || input.agentId;
  return loadPromptTemplate("identity.md", {
    agent_name: name,
    agent_id: input.agentId,
  });
}
