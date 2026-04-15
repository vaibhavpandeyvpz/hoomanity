#!/usr/bin/env bun
import type { McpServer } from "@agentclientprotocol/sdk";
import { Command } from "commander";
import { StdioAgentTransport } from "./core/agent-transport";
import { ApprovalService } from "./core/approval-service";
import { AcpSessionStore } from "./core/acp-session-store";
import { AcpClient } from "./core/acp-client";
import { CoreOrchestrator } from "./core/orchestrator";
import { SessionRegistry } from "./core/session-registry";
import { TurnQueue } from "./core/turn-queue";
import type { RuntimeListener } from "./contracts";
import { createEnabledListeners } from "./listeners/registry";
import { runConfigureUi } from "./configure";
import { loadConfig } from "./config";
import { log } from "./core/logger";
import { acpSessionsPath } from "./paths";

type PackageJson = {
  name?: string;
  version?: string;
  description?: string;
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
  .description("Open interactive configuration UI")
  .action(async () => {
    await runConfigureUi();
  });

program.action(async () => {
  await startApp();
});

await program.parseAsync();

async function startApp(): Promise<void> {
  log.info("starting hoomanity relay", { scope: "app" });
  const config = loadConfig();
  log.info("config loaded", {
    scope: "app",
    acpCwd: config.acp.cwd,
    approvalTimeoutMs: config.approvals.timeout_ms,
    slackAllowlist:
      config.slack.allowlist === "*" ? "*" : config.slack.allowlist.length,
    telegramAllowlist:
      config.telegram.allowlist === "*"
        ? "*"
        : config.telegram.allowlist.length,
    whatsappAllowlist:
      config.whatsapp.allowlist === "*"
        ? "*"
        : config.whatsapp.allowlist.length,
    slackEnabled: config.slack.enabled,
    telegramEnabled: config.telegram.enabled,
    whatsappEnabled: config.whatsapp.enabled,
  });
  const transport = new StdioAgentTransport(config.acp.cmd, config.acp.cwd);
  const approvals = new ApprovalService(config.approvals.timeout_ms);
  const acpClient = new AcpClient(transport, approvals);
  const sessionStore = new AcpSessionStore(acpSessionsPath);
  const sessions = new SessionRegistry(sessionStore);
  await sessions.hydrateFromDisk();
  const queue = new TurnQueue();
  const mcpServersByPlatform = new Map<string, () => McpServer[]>();
  const orchestrator = new CoreOrchestrator(
    acpClient,
    sessions,
    approvals,
    queue,
    config.acp.cwd,
    (platform) => mcpServersByPlatform.get(platform)?.() ?? [],
  );

  await acpClient.connect();
  log.info("acp client connected", { scope: "app" });
  const listeners: RuntimeListener[] = [];
  const enabledListeners = createEnabledListeners({
    config,
    orchestrator,
    approvals,
    sessions,
  });
  for (const { name, listener } of enabledListeners) {
    if (listener.mcpServers) {
      mcpServersByPlatform.set(name, () => listener.mcpServers?.() ?? []);
    }
    listeners.push(listener);
    log.info(`scheduling ${name} listener start`, { scope: "app" });
    void Promise.resolve()
      .then(() => listener.start())
      .then(() => {
        log.info(`${name} listener started`, { scope: "app" });
      })
      .catch((error) => {
        log.error(`${name} listener failed to start`, {
          scope: "app",
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }

  if (listeners.length === 0) {
    log.warn("no listeners enabled; process will stay idle", { scope: "app" });
  }

  let shuttingDown = false;
  const shutdown = async (signal: "SIGINT" | "SIGTERM") => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    log.info("received shutdown signal", { scope: "app", signal });

    for (const listener of listeners) {
      if (!listener.stop) continue;
      try {
        await listener.stop();
      } catch (error) {
        log.warn("listener stop failed", {
          scope: "app",
          signal,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    try {
      await acpClient.close();
    } catch (error) {
      log.warn("ACP close failed during shutdown", {
        scope: "app",
        error: error instanceof Error ? error.message : String(error),
      });
    }
    log.info("shutdown complete", { scope: "app" });
    process.exit(0);
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}
