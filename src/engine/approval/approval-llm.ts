import { generateText } from "ai";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ChannelType } from "../../channels/types.js";
import type { AiSdkTextModel } from "../../providers/types.js";
import { log } from "../../logging/app-logger.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PROMPTS_DIR = join(__dirname, "../../../src/prompts");

function loadPrompt(filename: string): string {
  const path = join(PROMPTS_DIR, filename);
  try {
    return readFileSync(path, "utf-8");
  } catch (err) {
    log.error(`Failed to load prompt: ${path}`, err);
    return "";
  }
}

export type ApprovalReplyLabel = "y" | "ya" | "n" | "na";

const APPROVAL_REPLY_LABELS: readonly ApprovalReplyLabel[] = [
  "y",
  "ya",
  "n",
  "na",
];

function isApprovalReplyLabel(s: string): s is ApprovalReplyLabel {
  return (APPROVAL_REPLY_LABELS as readonly string[]).includes(s);
}

/**
 * Format a tool-approval request as a short, human-readable prompt with channel-appropriate formatting.
 */
/** Optional channel-specific markdown appended after the base approval prompt. */
const APPROVAL_CHANNEL_PROMPT_FILES: Partial<Record<ChannelType, string>> = {
  slack: "channel-slack.md",
  whatsapp: "channel-whatsapp.md",
};

export async function formatApprovalMessageWithLlm(
  model: AiSdkTextModel,
  channelType: ChannelType,
  toolName: string,
  argsPreview: string,
): Promise<string> {
  const basePrompt = loadPrompt("approval-format.md");
  const channelFile = APPROVAL_CHANNEL_PROMPT_FILES[channelType];
  const channelPrompt = channelFile ? loadPrompt(channelFile) : "";

  const system = channelPrompt
    ? `${basePrompt}\n\n---\n\n${channelPrompt}`
    : basePrompt;

  const prompt = `
Tool: ${toolName}
Arguments preview: ${argsPreview}
Channel: ${channelType}
Output the approval message only.
`.trim();

  try {
    const { text } = await generateText({
      model,
      system,
      prompt,
    });
    return (text ?? "").trim();
  } catch (err) {
    log.error("formatApprovalMessageWithLlm error:", err);
    return `Allow ${toolName} with ${argsPreview}?`;
  }
}

/**
 * Classify the user's reply to an approval prompt into a single label.
 */
export async function parseApprovalReplyWithLlm(
  model: AiSdkTextModel,
  userReply: string,
  toolName?: string,
  approvalMessage?: string,
): Promise<ApprovalReplyLabel> {
  const system = loadPrompt("approval-parse-reply.md");
  let prompt = `User reply: "${userReply}"\n`;
  if (approvalMessage) {
    prompt += `\nThe approval prompt that was shown to the user:\n"${approvalMessage}"\n`;
  }
  if (toolName) {
    prompt += `\nTool that was awaiting approval: ${toolName}\n`;
  }
  prompt += `\nClassification (y/ya/n/na):`;

  try {
    const { text } = await generateText({
      model,
      system,
      prompt,
    });
    const result = (text ?? "").trim().toLowerCase();
    if (isApprovalReplyLabel(result)) {
      return result;
    }
  } catch (err) {
    log.error("parseApprovalReplyWithLlm error:", err);
  }
  return "na";
}
