/** Appended to static instructions when the session runs in the CLI channel. */
export function buildCliCwdInstructionsAppendix(cwd: string): string {
  const c = cwd.trim();
  if (!c) {
    return "";
  }
  return [
    "## Current working directory (CLI)",
    "",
    "The user started this session from the following directory. Use it as the default for shell commands, relative file paths, and the skills CLI unless they specify otherwise:",
    "",
    `\`${c}\``,
  ].join("\n");
}
