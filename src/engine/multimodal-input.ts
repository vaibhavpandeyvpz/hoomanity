import { readFile } from "node:fs/promises";
import type { AgentInputItem } from "@openai/agents";
import { isVisionImageMime } from "../attachments/mime.js";
import { collectChannelMessageAttachments } from "../channels/attachment-utils.js";
import type { Channel, ChannelMessage } from "../channels/types.js";
import { isStructuredChannelMessage } from "../channels/types.js";
import type { AgentConfig } from "../store/types.js";
import {
  buildModelInputFromTurnContext,
  formatTurnContextForModel,
  turnContextFromPrompt,
} from "./turn-context.js";
import { resolvedEnableFileInput } from "./agent-limits.js";

type UserContentPart =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image: string }
  | { type: "input_file"; file: string; filename?: string };

/**
 * String for plain CLI / structured messages without files; otherwise one user
 * {@link AgentInputItem} with multimodal parts plus a final “Files uploaded:” path list.
 */
export async function buildRunModelInput(
  prompt: string | ChannelMessage,
  channel: Channel | undefined,
  cfg: AgentConfig,
): Promise<string | AgentInputItem[]> {
  if (!isStructuredChannelMessage(prompt)) {
    return buildModelInputFromTurnContext(
      turnContextFromPrompt(prompt, channel),
    );
  }

  const refs = collectChannelMessageAttachments(prompt);
  if (refs.length === 0) {
    return buildModelInputFromTurnContext(
      turnContextFromPrompt(prompt, channel),
    );
  }

  const turn = turnContextFromPrompt(prompt, channel);
  const preamble = formatTurnContextForModel(turn);
  const enableFile = resolvedEnableFileInput(cfg);
  const content: UserContentPart[] = [];

  if (preamble.trim().length > 0) {
    content.push({ type: "input_text", text: preamble });
  }

  for (const a of refs) {
    const buf = await readFile(a.path);
    const b64 = buf.toString("base64");
    const mime = a.mimeType.split(";")[0]?.trim() || "application/octet-stream";
    if (isVisionImageMime(mime)) {
      content.push({
        type: "input_image",
        image: `data:${mime};base64,${b64}`,
      });
    } else if (enableFile) {
      content.push({
        type: "input_file",
        file: `data:${mime};base64,${b64}`,
        filename: a.originalName,
      });
    }
  }

  content.push({
    type: "input_text",
    text: `Files uploaded:\n${refs.map((r) => r.path).join("\n")}`,
  });

  const hasMediaPart = content.some(
    (c) => c.type === "input_image" || c.type === "input_file",
  );
  if (!hasMediaPart && preamble.trim().length === 0) {
    content.unshift({ type: "input_text", text: "User sent media." });
  }

  return [
    {
      role: "user",
      content,
    } as AgentInputItem,
  ];
}
