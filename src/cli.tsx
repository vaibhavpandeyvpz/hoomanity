#!/usr/bin/env node
import { setTracingDisabled } from "@openai/agents";
import { render } from "ink";
import { createContainer } from "./cli/container.js";
import { ConfigureApp } from "./cli/ConfigureApp.js";
import { LaunchApp } from "./cli/LaunchApp.js";

setTracingDisabled(true);

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isConfigure =
    args[0] === "configure" || args[0] === "config" || args[0] === "cfg";
  const ctn = createContainer();
  const { waitUntilExit } = render(
    isConfigure ? (
      <ConfigureApp container={ctn} />
    ) : (
      <LaunchApp container={ctn} />
    ),
    { exitOnCtrlC: false },
  );
  await waitUntilExit();
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
