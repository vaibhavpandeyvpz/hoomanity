import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import tty from "node:tty";

/**
 * Opens VISUAL / EDITOR (or platform default) on a temp file, blocks until the process exits,
 * then returns the file contents. Restores TTY raw mode for Ink after the editor closes.
 */
export function openEditorWithInitialContent(initial: string): string {
  const dir = mkdtempSync(join(tmpdir(), "hoomanity-inst-"));
  const file = join(dir, "INSTRUCTIONS.md");
  writeFileSync(file, initial, "utf8");

  const restore = releaseStdinForSubprocess();
  try {
    const { command, args, options } = resolveEditorSpawn(file);
    const r = spawnSync(command, args, options);
    if (r.error) {
      throw r.error;
    }
    if (r.status !== 0 && r.status !== null) {
      throw new Error(`Editor exited with code ${r.status}`);
    }
    return readFileSync(file, "utf8");
  } finally {
    restore();
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

function releaseStdinForSubprocess(): () => void {
  if (!process.stdin.isTTY) {
    return () => {};
  }
  const stdin = process.stdin as tty.ReadStream;
  const wasRaw = stdin.isRaw;
  if (wasRaw) {
    stdin.setRawMode(false);
  }
  stdin.pause();
  return () => {
    stdin.resume();
    if (wasRaw) {
      stdin.setRawMode(true);
    }
  };
}

function resolveEditorSpawn(filePath: string): {
  command: string;
  args: string[];
  options: { stdio: "inherit"; shell?: boolean };
} {
  const spec = (process.env.VISUAL ?? process.env.EDITOR ?? "").trim();
  if (!spec) {
    if (process.platform === "win32") {
      return {
        command: "notepad",
        args: [filePath],
        options: { stdio: "inherit" },
      };
    }
    return {
      command: "vi",
      args: [filePath],
      options: { stdio: "inherit" },
    };
  }

  if (process.platform === "win32") {
    return {
      command: `${spec} "${filePath.replace(/"/g, '\\"')}"`,
      args: [],
      options: { stdio: "inherit", shell: true },
    };
  }

  const parts = tokenizeEditorSpec(spec);
  if (parts.length === 0) {
    return {
      command: "vi",
      args: [filePath],
      options: { stdio: "inherit" },
    };
  }
  return {
    command: parts[0]!,
    args: [...parts.slice(1), filePath],
    options: { stdio: "inherit" },
  };
}

/** Split VISUAL/EDITOR on spaces; very basic quoted-token support. */
function tokenizeEditorSpec(s: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i]!;
    if (quote) {
      if (c === quote) {
        quote = null;
      } else {
        cur += c;
      }
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c as '"' | "'";
      continue;
    }
    if (/\s/.test(c)) {
      if (cur.length > 0) {
        out.push(cur);
        cur = "";
      }
      continue;
    }
    cur += c;
  }
  if (cur.length > 0) {
    out.push(cur);
  }
  return out;
}
