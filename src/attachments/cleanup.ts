import { readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { agentSessionAttachmentsDir } from "../store/paths.js";

type FileStat = {
  readonly path: string;
  readonly size: number;
  readonly mtime: number;
};

/**
 * Deletes oldest files in the session attachments dir until existing total + `incomingBytes`
 * is at most `maxTotalBytes`.
 */
export async function enforceInboundAttachmentsQuota(
  agentId: string,
  sessionId: string,
  maxTotalBytes: number,
  incomingBytes: number,
): Promise<void> {
  const root = agentSessionAttachmentsDir(agentId, sessionId);
  let names: string[];
  try {
    names = await readdir(root);
  } catch {
    return;
  }

  const files: FileStat[] = [];
  for (const name of names) {
    const p = join(root, name);
    try {
      const s = await stat(p);
      if (s.isFile()) {
        files.push({ path: p, size: s.size, mtime: s.mtimeMs });
      }
    } catch {
      /* skip */
    }
  }

  let total = files.reduce((a, f) => a + f.size, 0);
  const target = maxTotalBytes - incomingBytes;
  if (total <= target) {
    return;
  }

  const sorted = [...files].sort((a, b) => a.mtime - b.mtime);
  for (const f of sorted) {
    if (total <= target) {
      break;
    }
    try {
      await unlink(f.path);
      total -= f.size;
    } catch {
      /* skip */
    }
  }
}
