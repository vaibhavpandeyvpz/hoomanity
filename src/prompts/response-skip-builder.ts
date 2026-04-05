import { RESPONSE_SKIP_MARKER } from "../engine/response-skip.js";

/**
 * Teaches the model when to suppress a user-visible reply (runner checks for {@link RESPONSE_SKIP_MARKER}).
 */
export async function buildResponseSkipInstructionsAppendix(): Promise<string> {
  return [
    "### When not to send a user-visible reply",
    "",
    `If the user explicitly asks for no reply, says to ignore the message, or the message clearly needs no assistant response, output exactly \`${RESPONSE_SKIP_MARKER}\` and nothing else.`,
    "When unsure whether to skip, prefer a short helpful reply.",
    "",
    "Do not use this marker when the user wants updates, follow-ups, mentions of contacting someone else, or anything that needs tools or a normal answer.",
  ].join("\n");
}
