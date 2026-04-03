import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { AgentNotFoundError, RegistryCorruptError } from "./errors.js";
import { AgentRegistryEntrySchema, type AgentRegistryEntry } from "./types.js";
import { agentDir, agentsJsonlPath } from "../utils/path-helpers.js";

async function rewrite(entries: AgentRegistryEntry[]): Promise<void> {
  const jsonl = agentsJsonlPath();
  await mkdir(dirname(jsonl), { recursive: true });
  const tmp = `${jsonl}.tmp`;
  const body =
    entries.map((e) => JSON.stringify(e)).join("\n") +
    (entries.length ? "\n" : "");
  await writeFile(tmp, body, "utf8");
  await rename(tmp, jsonl);
}

export async function list(): Promise<AgentRegistryEntry[]> {
  const jsonl = agentsJsonlPath();
  let raw: string;
  try {
    raw = await readFile(jsonl, "utf8");
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      return [];
    }
    throw e;
  }
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const entries: AgentRegistryEntry[] = [];
  for (const line of lines) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line) as unknown;
    } catch {
      throw new RegistryCorruptError(
        `Invalid JSON line in agents registry: ${line}`,
      );
    }
    const r = AgentRegistryEntrySchema.safeParse(parsed);
    if (!r.success) {
      throw new RegistryCorruptError(`Invalid registry entry: ${line}`);
    }
    entries.push(r.data);
  }
  return entries;
}

export async function get(id: string): Promise<AgentRegistryEntry | undefined> {
  const all = await list();
  return all.find((e) => e.id === id);
}

export async function append(entry: AgentRegistryEntry): Promise<void> {
  const jsonl = agentsJsonlPath();
  await mkdir(dirname(jsonl), { recursive: true });
  const line = `${JSON.stringify(entry)}\n`;
  await writeFile(jsonl, line, { flag: "a" });
}

export async function toggle(id: string): Promise<void> {
  const entries = await list();
  const idx = entries.findIndex((e) => e.id === id);
  if (idx === -1) {
    throw new AgentNotFoundError(id);
  }
  const cur = entries[idx];
  entries[idx] = { ...cur, enabled: !cur.enabled };
  await rewrite(entries);
}

export async function remove(id: string): Promise<void> {
  const entries = await list();
  const filtered = entries.filter((e) => e.id !== id);
  if (filtered.length === entries.length) {
    throw new AgentNotFoundError(id);
  }
  await rewrite(filtered);
  await rm(agentDir(id), { recursive: true, force: true });
}
