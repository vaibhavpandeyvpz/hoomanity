import { loadPromptTemplate } from "../prompts/load-prompt.js";

/**
 * General agent behavior. Template: {@link ../prompts/operating-guidelines.md}.
 */
export async function buildOperatingGuidelinesInstructionsAppendix(): Promise<string> {
  return loadPromptTemplate("operating-guidelines.md", {});
}
