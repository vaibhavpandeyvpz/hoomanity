import { copyFile, mkdir, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "src", "prompts");
const destDir = join(root, "dist", "prompts");

await mkdir(destDir, { recursive: true });
for (const name of await readdir(srcDir)) {
  if (name.endsWith(".md")) {
    await copyFile(join(srcDir, name), join(destDir, name));
  }
}
