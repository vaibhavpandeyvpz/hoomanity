import { describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadConfig,
  loadEditableConfig,
  writeEditableConfig,
} from "../../src/config";

describe("loadConfig", () => {
  it("defaults allowlists when omitted", () => {
    const config = loadConfig({
      ...process.env,
      ACP_CMD: "true",
      HOOMANITY_CONFIG_PATH: "/nonexistent/hoomanity-config-404.json",
    });
    expect(config.slack.allowlist).toBe("*");
    expect(config.telegram.allowlist).toBe("*");
    expect(config.whatsapp.allowlist).toBe("*");
    expect(config.slack.require_mention).toBe(false);
    expect(config.telegram.require_mention).toBe(false);
    expect(config.whatsapp.require_mention).toBe(false);
  });

  it("normalizes listener allowlists from config file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "hoomanity-cfg-"));
    const configPath = join(dir, "config.json");
    try {
      await writeFile(
        configPath,
        JSON.stringify({
          acp: { cmd: "true", cwd: "/tmp" },
          slack: { allowlist: ["C123", " C456 ", "C123"] },
          telegram: { allowlist: ["12345", " 67890 ", "12345"] },
          whatsapp: { allowlist: ["15550000001", " 15550000002 "] },
        }),
        "utf8",
      );
      const config = loadConfig({
        ...process.env,
        HOOMANITY_CONFIG_PATH: configPath,
      });
      expect(config.acp).toEqual({ cmd: "true" });
      expect(config.slack.allowlist).toEqual(["C123", "C456"]);
      expect(config.telegram.allowlist).toEqual(["12345", "67890"]);
      expect(config.whatsapp.allowlist).toEqual(["15550000001", "15550000002"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("loads editable config without runtime validation failures", async () => {
    const dir = await mkdtemp(join(tmpdir(), "hoomanity-cfg-"));
    const configPath = join(dir, "config.json");
    try {
      await writeFile(
        configPath,
        JSON.stringify({
          acp: { cmd: "", cwd: "/tmp" },
          slack: { enabled: true },
        }),
        "utf8",
      );
      const { config } = loadEditableConfig({
        ...process.env,
        HOOMANITY_CONFIG_PATH: configPath,
      });
      expect(config.acp.cmd).toBe("");
      expect(config.slack.enabled).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("writes editable config to disk", async () => {
    const dir = await mkdtemp(join(tmpdir(), "hoomanity-cfg-"));
    const configPath = join(dir, "config.json");
    try {
      const { config } = loadEditableConfig({
        ...process.env,
        HOOMANITY_CONFIG_PATH: configPath,
      });
      config.acp.cmd = "bun x codex";
      config.slack.enabled = true;
      config.slack.token = "xoxp-demo";
      config.slack.app_token = "xapp-demo";
      config.telegram.enabled = true;
      config.telegram.bot_token = "123:telegram-demo";
      config.telegram.allowlist = ["12345"];
      config.whatsapp.enabled = true;
      config.whatsapp.session_path = "primary";
      config.whatsapp.client_id = "phone-a";
      config.whatsapp.allowlist = ["15551234567"];
      await writeEditableConfig(config, {
        ...process.env,
        HOOMANITY_CONFIG_PATH: configPath,
      });

      const rawOnDisk = JSON.parse(await readFile(configPath, "utf8")) as {
        acp?: Record<string, unknown>;
      };
      expect(rawOnDisk.acp).toEqual({ cmd: "bun x codex" });

      const reloaded = loadConfig({
        ...process.env,
        HOOMANITY_CONFIG_PATH: configPath,
      });
      expect(reloaded.acp.cmd).toBe("bun x codex");
      expect(reloaded.slack.enabled).toBe(true);
      expect(reloaded.slack.token).toBe("xoxp-demo");
      expect(reloaded.slack.app_token).toBe("xapp-demo");
      expect(reloaded.telegram.enabled).toBe(true);
      expect(reloaded.telegram.bot_token).toBe("123:telegram-demo");
      expect(reloaded.telegram.allowlist).toEqual(["12345"]);
      expect(reloaded.whatsapp.enabled).toBe(true);
      expect(reloaded.whatsapp.session_path).toBe("primary");
      expect(reloaded.whatsapp.client_id).toBe("phone-a");
      expect(reloaded.whatsapp.allowlist).toEqual(["15551234567"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
