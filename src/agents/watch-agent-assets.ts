import { relative, resolve } from "node:path";
import { watch } from "chokidar";
import {
  AGENT_CONFIG_BASENAME,
  AGENT_INSTRUCTIONS_BASENAME,
  AGENT_MCP_BASENAME,
} from "./files.js";
import { agentDir, agentSkillsDir } from "../utils/path-helpers.js";

const DEBOUNCE_MS = 150;

function relUnderAgent(root: string, fullPath: string): string {
  return relative(resolve(root), resolve(fullPath)).replace(/\\/g, "/");
}

/**
 * Paths that affect the built agent: config, instructions, MCP, and
 * {@link agentSkillsDir} (`skills/` under the agent dir) only.
 */
function isWatchedRelPath(rel: string, skillsRel: string): boolean {
  if (rel === "" || rel === ".") {
    return true;
  }
  if (
    rel === AGENT_CONFIG_BASENAME ||
    rel === AGENT_INSTRUCTIONS_BASENAME ||
    rel === AGENT_MCP_BASENAME
  ) {
    return true;
  }
  if (rel === skillsRel || rel.startsWith(`${skillsRel}/`)) {
    return true;
  }
  // Ancestors of `skillsRel` only (e.g. none when `skills/` is directly under the agent dir).
  return skillsRel.startsWith(`${rel}/`);
}

/**
 * Watches on-disk assets; debounced {@link onInvalidate} when they change.
 */
export function watchAgentAssetsForInvalidation(
  agentId: string,
  onInvalidate: () => void,
): { close: () => Promise<void> } {
  const root = agentDir(agentId);
  const skillsRel = relUnderAgent(root, agentSkillsDir(agentId));
  let timer: ReturnType<typeof setTimeout> | undefined;

  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => onInvalidate(), DEBOUNCE_MS);
  };

  const watcher = watch(root, {
    ignoreInitial: true,
    ignored: (fullPath: string) => {
      const rel = relUnderAgent(root, fullPath);
      return !isWatchedRelPath(rel, skillsRel);
    },
    awaitWriteFinish: {
      stabilityThreshold: 150,
      pollInterval: 50,
    },
  });

  watcher.on("all", schedule);

  return {
    close: async () => {
      clearTimeout(timer);
      await watcher.close();
    },
  };
}
