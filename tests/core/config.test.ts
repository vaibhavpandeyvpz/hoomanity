import { describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig } from "../../src/config";
import { DEFAULT_STOP_COMMAND_PHRASES } from "../../src/core/stop-command";

describe("loadConfig", () => {
  it("defaults stop_commands and allowlists when omitted", () => {
    const config = loadConfig({
      ...process.env,
      ACP_CMD: "true",
      HOOMAN_CONFIG_PATH: "/nonexistent/hooman-config-404.json",
    });
    expect(config.stop_commands).toEqual([...DEFAULT_STOP_COMMAND_PHRASES]);
    expect(config.slack.allowlist).toBe("*");
    expect(config.whatsapp.allowlist).toBe("*");
    expect(config.wwebjs.allowlist).toBe("*");
  });

  it("reads stop_commands from config file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "hooman-cfg-"));
    const configPath = join(dir, "config.json");
    try {
      await writeFile(
        configPath,
        JSON.stringify({
          acp: { cmd: "true", cwd: "/tmp" },
          stop_commands: ["halt", " /HALT "],
        }),
        "utf8",
      );
      const config = loadConfig({
        ...process.env,
        HOOMAN_CONFIG_PATH: configPath,
      });
      expect(config.stop_commands).toEqual(["halt", "/HALT"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("allows empty stop_commands to disable cancel phrases", async () => {
    const dir = await mkdtemp(join(tmpdir(), "hooman-cfg-"));
    const configPath = join(dir, "config.json");
    try {
      await writeFile(
        configPath,
        JSON.stringify({
          acp: { cmd: "true", cwd: "/tmp" },
          stop_commands: [],
        }),
        "utf8",
      );
      const config = loadConfig({
        ...process.env,
        HOOMAN_CONFIG_PATH: configPath,
      });
      expect(config.stop_commands).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("normalizes listener allowlists from config file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "hooman-cfg-"));
    const configPath = join(dir, "config.json");
    try {
      await writeFile(
        configPath,
        JSON.stringify({
          acp: { cmd: "true", cwd: "/tmp" },
          slack: { allowlist: ["C123", " C456 ", "C123"] },
          whatsapp: { allowlist: "15551234567" },
          wwebjs: { allowlist: ["15550000001", " 15550000002 "] },
        }),
        "utf8",
      );
      const config = loadConfig({
        ...process.env,
        HOOMAN_CONFIG_PATH: configPath,
      });
      expect(config.slack.allowlist).toEqual(["C123", "C456"]);
      expect(config.whatsapp.allowlist).toEqual(["15551234567"]);
      expect(config.wwebjs.allowlist).toEqual(["15550000001", "15550000002"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
