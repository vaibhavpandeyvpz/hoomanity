#!/usr/bin/env bun
import { Command } from "commander";
import { homedir } from "node:os";
import { join } from "node:path";
import { StdioAgentTransport } from "./core/agent-transport";
import { ApprovalService } from "./core/approval-service";
import { AcpSessionStore } from "./core/acp-session-store";
import { AcpClient } from "./core/acp-client";
import { CoreOrchestrator } from "./core/orchestrator";
import { SessionRegistry } from "./core/session-registry";
import { TurnQueue } from "./core/turn-queue";
import { SlackListener } from "./listeners/slack/client";
import { WhatsAppListener } from "./listeners/whatsapp/client";
import { WhatsAppWwebjsListener } from "./listeners/whatsapp-wwebjs/client";
import { configureWwebjsSession } from "./listeners/whatsapp-wwebjs/configure";
import { loadConfig } from "./config";
import { log } from "./core/logger";

type PackageJson = {
  name?: string;
  version?: string;
  description?: string;
};

type Stoppable = {
  stop?: () => Promise<void>;
};

const pkg = (await Bun.file(
  `${import.meta.dir}/../package.json`,
).json()) as PackageJson;

const program = new Command();

program
  .name(pkg.name ?? "cli")
  .description(pkg.description ?? "")
  .version(pkg.version ?? "0.0.0");

program
  .command("start")
  .description("Start ACP relay and enabled listeners")
  .action(async () => {
    await startApp();
  });

program
  .command("configure")
  .description("Configure a platform listener session")
  .argument("<platform>", "platform name, e.g. wwebjs")
  .action(async (platform: string) => {
    await configurePlatform(platform);
  });

program.action(async () => {
  await startApp();
});

await program.parseAsync();

async function startApp(): Promise<void> {
  log("info", "app", "starting hooman relay");
  const config = loadConfig();
  log("info", "app", "config loaded", {
    acpCwd: config.acp.cwd,
    approvalTimeoutMs: config.approvals.timeout_ms,
    stopCommandCount: config.stop_commands.length,
    slackAllowlist:
      config.slack.allowlist === "*" ? "*" : config.slack.allowlist.length,
    whatsappAllowlist:
      config.whatsapp.allowlist === "*"
        ? "*"
        : config.whatsapp.allowlist.length,
    wwebjsAllowlist:
      config.wwebjs.allowlist === "*" ? "*" : config.wwebjs.allowlist.length,
    slackEnabled: config.slack.enabled,
    whatsappEnabled: config.whatsapp.enabled,
    wwebjsEnabled: config.wwebjs.enabled,
  });
  const transport = new StdioAgentTransport(config.acp.cmd, config.acp.cwd);
  const approvals = new ApprovalService(config.approvals.timeout_ms);
  const acpClient = new AcpClient(transport, approvals);
  const sessionStore = new AcpSessionStore(
    join(homedir(), ".hooman", "acp-sessions.json"),
  );
  const sessions = new SessionRegistry(sessionStore);
  await sessions.hydrateFromDisk();
  const queue = new TurnQueue();
  const orchestrator = new CoreOrchestrator(
    acpClient,
    sessions,
    approvals,
    queue,
    config.acp.cwd,
  );

  await acpClient.connect();
  log("info", "app", "acp client connected");
  let startedListeners = 0;
  const listeners: Stoppable[] = [];

  if (
    config.slack.enabled &&
    config.slack.app_token &&
    config.slack.bot_token
  ) {
    const slack = new SlackListener({
      appToken: config.slack.app_token,
      botToken: config.slack.bot_token,
      allowlist: config.slack.allowlist,
      stopCommands: config.stop_commands,
      orchestrator,
      approvals,
      sessions,
    });
    await slack.start();
    listeners.push(slack);
    startedListeners += 1;
    log("info", "app", "slack listener started");
  }

  if (config.whatsapp.enabled) {
    const whatsapp = new WhatsAppListener({
      config: config.whatsapp,
      allowlist: config.whatsapp.allowlist,
      stopCommands: config.stop_commands,
      orchestrator,
      approvals,
      sessions,
    });
    await whatsapp.start();
    listeners.push(whatsapp);
    startedListeners += 1;
    log("info", "app", "official whatsapp listener started");
  }

  if (config.wwebjs.enabled) {
    const wwebjs = new WhatsAppWwebjsListener({
      config: config.wwebjs,
      allowlist: config.wwebjs.allowlist,
      stopCommands: config.stop_commands,
      orchestrator,
      approvals,
      sessions,
    });
    await wwebjs.start();
    listeners.push(wwebjs);
    startedListeners += 1;
    log("info", "app", "wwebjs listener started");
  }

  if (startedListeners === 0) {
    log("warn", "app", "no listeners enabled; process will stay idle");
  }

  let shuttingDown = false;
  const shutdown = async (signal: "SIGINT" | "SIGTERM") => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    log("info", "app", "received shutdown signal", { signal });

    for (const listener of listeners) {
      if (!listener.stop) continue;
      try {
        await listener.stop();
      } catch (error) {
        log("warn", "app", "listener stop failed", {
          signal,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    try {
      await acpClient.close();
    } catch (error) {
      log("warn", "app", "ACP close failed during shutdown", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    log("info", "app", "shutdown complete");
    process.exit(0);
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

async function configurePlatform(platform: string): Promise<void> {
  const normalized = platform.trim().toLowerCase();
  const config = loadConfig();

  if (normalized === "wwebjs" || normalized === "whatsapp-wwebjs") {
    log("info", "configure", "starting wwebjs configuration flow");
    await configureWwebjsSession(config.wwebjs);
    log("info", "configure", "wwebjs configuration completed");
    return;
  }

  throw new Error(
    `Unsupported platform "${platform}". Currently supported: wwebjs`,
  );
}
