import { readFile } from "node:fs/promises";
import type { KnownPlatformName, PlatformName } from "../contracts";

const promptFiles: Record<KnownPlatformName, URL> = {
  slack: new URL("./slack.md", import.meta.url),
  telegram: new URL("./telegram.md", import.meta.url),
  whatsapp: new URL("./whatsapp.md", import.meta.url),
};

const promptCache = new Map<KnownPlatformName, Promise<string | undefined>>();

export async function getPlatformSystemPrompt(
  platform: PlatformName,
): Promise<string | undefined> {
  const key = platform.trim().toLowerCase();
  if (!isKnownPlatformName(key)) {
    return undefined;
  }
  let cached = promptCache.get(key);
  if (!cached) {
    cached = readPromptFile(key);
    promptCache.set(key, cached);
  }
  return cached;
}

function isKnownPlatformName(value: string): value is KnownPlatformName {
  return value in promptFiles;
}

async function readPromptFile(
  platform: KnownPlatformName,
): Promise<string | undefined> {
  try {
    const text = await readFile(promptFiles[platform], "utf8");
    const trimmed = text.trim();
    return trimmed || undefined;
  } catch {
    return undefined;
  }
}
