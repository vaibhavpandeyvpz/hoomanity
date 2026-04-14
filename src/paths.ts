import { homedir } from "node:os";
import { join } from "node:path";

export const baseDir = join(homedir(), ".hoomanity");

export const configFilePath = join(baseDir, "config.json");
export const attachmentsDir = join(baseDir, "attachments");
export const acpSessionsPath = join(baseDir, "acp-sessions.json");
export const whatsappBaseDir = join(baseDir, "whatsapp");

export function whatsappSessionRoot(sessionPath?: string): string {
  return join(whatsappBaseDir, sessionPath ?? "default");
}
