import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { agentSessionAttachmentsDir } from "../store/paths.js";
import { enforceInboundAttachmentsQuota } from "./cleanup.js";

export type SavedInboundAttachment = {
  readonly id: string;
  readonly path: string;
  readonly mimeType: string;
  readonly originalName: string;
};

function sanitizeBasename(name: string): string {
  const t = name.trim().replace(/[/\\?*:|"<>]/g, "_");
  return t.length > 0 ? t.slice(0, 120) : "file";
}

/**
 * Persist an inbound file under
 * `~/.hoomanity/agents/<agentId>/sessions/<sessionId>/attachments/`.
 */
export async function saveInboundAttachment(
  agentId: string,
  sessionId: string,
  input: {
    readonly buffer: Buffer;
    readonly originalName: string;
    readonly mimeType: string;
  },
  options?: { readonly maxTotalBytes?: number },
): Promise<SavedInboundAttachment> {
  const dir = agentSessionAttachmentsDir(agentId, sessionId);
  await mkdir(dir, { recursive: true });

  if (options?.maxTotalBytes != null && options.maxTotalBytes > 0) {
    await enforceInboundAttachmentsQuota(
      agentId,
      sessionId,
      options.maxTotalBytes,
      input.buffer.length,
    );
  }

  const id = randomUUID();
  const safe = sanitizeBasename(input.originalName);
  const filename = `${id}_${safe}`;
  const fullPath = join(dir, filename);
  await writeFile(fullPath, input.buffer);

  return {
    id,
    path: fullPath,
    mimeType: input.mimeType,
    originalName: input.originalName,
  };
}
