import { loadPromptTemplate } from "../prompts/load-prompt.js";
import { SKILLS_CLI_PACKAGE } from "./registry.js";

/**
 * Tools/skills fulfillment and missing-capability flow.
 * Template: {@link ../prompts/capability-guidance.md}.
 */
export async function buildCapabilityGuidanceInstructionsAppendix(): Promise<string> {
  return loadPromptTemplate("capability-guidance.md", {
    skills_cli_package: SKILLS_CLI_PACKAGE,
  });
}
