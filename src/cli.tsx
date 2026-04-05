#!/usr/bin/env node
import { setTracingDisabled } from "@openai/agents";
import { render } from "ink";
import { createContainer } from "./cli/container.js";
import { ConfigureScreen } from "./cli/screens/configure/ConfigureScreen.js";
import { RunScreen } from "./cli/screens/run/RunScreen.js";
import { log } from "./logging/app-logger.js";
import type { ChannelType } from "./channels/types.js";

setTracingDisabled(true);

function parseChannelTypeFlag(raw: string | null): ChannelType | undefined {
  if (raw === "cli" || raw === "slack" || raw === "whatsapp") {
    return raw;
  }
  return undefined;
}

function parseBotMemoryModeFlag(
  raw: string | null,
): "single" | "multi" | undefined {
  if (raw === "single" || raw === "multi") {
    return raw;
  }
  return undefined;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isConfigure =
    args[0] === "configure" || args[0] === "config" || args[0] === "cfg";

  // Simple flag parser
  const getFlag = (name: string) => {
    const idx = args.indexOf(name);
    if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
    return null;
  };

  const channel = parseChannelTypeFlag(getFlag("--channel"));
  const botMemoryMode = parseBotMemoryModeFlag(getFlag("--bot-memory"));
  const agentId =
    getFlag("--agent") || (args[0] !== "configure" ? args[0] : "");

  const ctn = createContainer();
  const { waitUntilExit } = render(
    isConfigure ? (
      <ConfigureScreen container={ctn} />
    ) : (
      <RunScreen
        container={ctn}
        initialAgentId={agentId}
        initialChannel={channel}
        initialBotMemoryMode={botMemoryMode}
      />
    ),
    { exitOnCtrlC: false },
  );
  await waitUntilExit();
}

main().catch((e: unknown) => {
  log.error("hoomanity exited with error", e);
  process.exit(1);
});
