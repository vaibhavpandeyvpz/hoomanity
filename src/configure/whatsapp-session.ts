import { rm } from "node:fs/promises";
import { join } from "node:path";
import { whatsappSessionRoot } from "../paths";

export type WhatsAppSessionPaths = {
  session_path?: string;
  client_id?: string;
};

export function whatsappAuthRoot(config: WhatsAppSessionPaths): string {
  return whatsappSessionRoot(config.session_path);
}

export async function clearWhatsAppSessionData(
  config: WhatsAppSessionPaths,
): Promise<void> {
  const root = whatsappAuthRoot(config);
  const clientId = config.client_id ?? "default";
  const target = join(root, `session-${clientId}`);
  await rm(target, { recursive: true, force: true });
}
