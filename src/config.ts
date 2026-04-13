import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { IdAllowlist } from "./core/allowlist";
import { DEFAULT_STOP_COMMAND_PHRASES } from "./core/stop-command";

export type AppConfig = {
  acp: {
    cmd: string;
    cwd: string;
  };
  approvals: {
    timeout_ms: number;
  };
  /** Exact user messages (after trim) that trigger session cancel; case-insensitive. Empty disables. */
  stop_commands: string[];
  slack: {
    enabled: boolean;
    bot_token?: string;
    app_token?: string;
    allowlist: IdAllowlist;
  };
  whatsapp: {
    enabled: boolean;
    access_token?: string;
    phone_number_id?: string;
    verify_token?: string;
    app_secret?: string;
    webhook_base_url?: string;
    webhook_port?: number;
    webhook_path?: string;
    allowlist: IdAllowlist;
  };
  wwebjs: {
    enabled: boolean;
    session_path?: string;
    client_id?: string;
    puppeteer_executable_path?: string;
    allowlist: IdAllowlist;
  };
};

type SlackAllowlistFileValue = "*" | string[];
type WhatsAppAllowlistFileValue = "*" | string | string[];

type FileConfig = Partial<Omit<AppConfig, "slack" | "whatsapp" | "wwebjs">> & {
  slack?: Partial<Omit<AppConfig["slack"], "allowlist">> & {
    allowlist?: SlackAllowlistFileValue;
  };
  whatsapp?: Partial<Omit<AppConfig["whatsapp"], "allowlist">> & {
    allowlist?: WhatsAppAllowlistFileValue;
  };
  wwebjs?: Partial<Omit<AppConfig["wwebjs"], "allowlist">> & {
    allowlist?: WhatsAppAllowlistFileValue;
  };
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const configPath =
    env.HOOMAN_CONFIG_PATH ?? join(homedir(), ".hooman", "config.json");
  const fromFile = loadFileConfig(configPath) ?? {};

  const config: AppConfig = {
    acp: {
      cmd: env.ACP_CMD ?? env.ACP_AGENT_COMMAND ?? fromFile.acp?.cmd ?? "",
      cwd: env.ACP_CWD ?? fromFile.acp?.cwd ?? process.cwd(),
    },
    approvals: {
      timeout_ms:
        parsePositiveInt(env.APPROVALS_TIMEOUT_MS) ??
        fromFile.approvals?.timeout_ms ??
        120000,
    },
    stop_commands: resolveStopCommands(fromFile, configPath),
    slack: {
      enabled: parseBool(env.SLACK_ENABLED) ?? fromFile.slack?.enabled ?? false,
      bot_token: env.SLACK_BOT_TOKEN ?? fromFile.slack?.bot_token,
      app_token: env.SLACK_APP_TOKEN ?? fromFile.slack?.app_token,
      allowlist: resolveSlackAllowlist(fromFile, configPath),
    },
    whatsapp: {
      enabled:
        parseBool(env.WHATSAPP_ENABLED) ?? fromFile.whatsapp?.enabled ?? false,
      access_token:
        env.WHATSAPP_ACCESS_TOKEN ?? fromFile.whatsapp?.access_token,
      phone_number_id:
        env.WHATSAPP_PHONE_NUMBER_ID ?? fromFile.whatsapp?.phone_number_id,
      verify_token:
        env.WHATSAPP_VERIFY_TOKEN ?? fromFile.whatsapp?.verify_token,
      app_secret: env.WHATSAPP_APP_SECRET ?? fromFile.whatsapp?.app_secret,
      webhook_base_url:
        env.WHATSAPP_WEBHOOK_BASE_URL ?? fromFile.whatsapp?.webhook_base_url,
      webhook_port:
        parsePositiveInt(env.WHATSAPP_WEBHOOK_PORT) ??
        fromFile.whatsapp?.webhook_port,
      webhook_path:
        env.WHATSAPP_WEBHOOK_PATH ??
        fromFile.whatsapp?.webhook_path ??
        "/whatsapp/webhook",
      allowlist: resolveWhatsAppAllowlist(
        fromFile.whatsapp?.allowlist,
        "whatsapp.allowlist",
        configPath,
      ),
    },
    wwebjs: {
      enabled:
        parseBool(env.WWEBJS_ENABLED) ?? fromFile.wwebjs?.enabled ?? false,
      session_path:
        env.WWEBJS_SESSION_PATH ?? fromFile.wwebjs?.session_path ?? "default",
      client_id:
        env.WWEBJS_CLIENT_ID ?? fromFile.wwebjs?.client_id ?? "default",
      puppeteer_executable_path:
        env.WWEBJS_PUPPETEER_EXECUTABLE_PATH ??
        fromFile.wwebjs?.puppeteer_executable_path,
      allowlist: resolveWhatsAppAllowlist(
        fromFile.wwebjs?.allowlist,
        "wwebjs.allowlist",
        configPath,
      ),
    },
  };

  validateConfig(config, configPath);
  return config;
}

function resolveStopCommands(
  fromFile: FileConfig,
  configPath: string,
): string[] {
  const raw = fromFile.stop_commands;
  if (raw === undefined) {
    return [...DEFAULT_STOP_COMMAND_PHRASES];
  }
  if (!Array.isArray(raw)) {
    throw new Error(
      `Invalid config at "${configPath}": stop_commands must be a JSON array of strings.`,
    );
  }
  const out: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string") {
      throw new Error(
        `Invalid config at "${configPath}": stop_commands must contain only strings.`,
      );
    }
    const t = entry.trim();
    if (t.length > 0) {
      out.push(t);
    }
  }
  return out;
}

function resolveSlackAllowlist(
  fromFile: FileConfig,
  configPath: string,
): IdAllowlist {
  const raw = fromFile.slack?.allowlist;
  if (raw === undefined || raw === "*") {
    return "*";
  }
  if (!Array.isArray(raw)) {
    throw new Error(
      `Invalid config at "${configPath}": slack.allowlist must be "*" or an array of channel ids.`,
    );
  }
  return normalizeStringArray(raw, "slack.allowlist", configPath);
}

function resolveWhatsAppAllowlist(
  raw: WhatsAppAllowlistFileValue | undefined,
  key: "whatsapp.allowlist" | "wwebjs.allowlist",
  configPath: string,
): IdAllowlist {
  if (raw === undefined || raw === "*") {
    return "*";
  }
  if (typeof raw === "string") {
    const value = raw.trim();
    return value ? [value] : [];
  }
  if (!Array.isArray(raw)) {
    throw new Error(
      `Invalid config at "${configPath}": ${key} must be "*", a chat id string, or an array of chat ids.`,
    );
  }
  return normalizeStringArray(raw, key, configPath);
}

function normalizeStringArray(
  values: string[],
  key: string,
  configPath: string,
): string[] {
  const out: string[] = [];
  for (const entry of values) {
    if (typeof entry !== "string") {
      throw new Error(
        `Invalid config at "${configPath}": ${key} must contain only strings.`,
      );
    }
    const trimmed = entry.trim();
    if (trimmed && !out.includes(trimmed)) {
      out.push(trimmed);
    }
  }
  return out;
}

function loadFileConfig(configPath: string): FileConfig | undefined {
  if (!existsSync(configPath)) {
    return undefined;
  }

  try {
    const raw = readFileSync(configPath, "utf-8");
    return JSON.parse(raw) as FileConfig;
  } catch (error) {
    throw new Error(
      `Failed to read config file at "${configPath}": ${toErrorMessage(error)}`,
    );
  }
}

function validateConfig(config: AppConfig, configPath: string): void {
  if (!config.acp.cmd.trim()) {
    throw new Error(`Invalid config at "${configPath}": acp.cmd is required.`);
  }
  if (
    !Number.isInteger(config.approvals.timeout_ms) ||
    config.approvals.timeout_ms <= 0
  ) {
    throw new Error(
      `Invalid config at "${configPath}": approvals.timeout_ms must be a positive integer.`,
    );
  }
  if (config.slack.enabled) {
    assertRequired(config.slack.bot_token, "slack.bot_token", configPath);
    assertRequired(config.slack.app_token, "slack.app_token", configPath);
  }
  if (config.whatsapp.enabled) {
    assertRequired(
      config.whatsapp.access_token,
      "whatsapp.access_token",
      configPath,
    );
    assertRequired(
      config.whatsapp.phone_number_id,
      "whatsapp.phone_number_id",
      configPath,
    );
    assertRequired(
      config.whatsapp.verify_token,
      "whatsapp.verify_token",
      configPath,
    );
    assertRequired(
      config.whatsapp.app_secret,
      "whatsapp.app_secret",
      configPath,
    );
  }
}

function assertRequired(
  value: string | undefined,
  key: string,
  configPath: string,
): void {
  if (!value?.trim()) {
    throw new Error(
      `Invalid config at "${configPath}": ${key} is required when enabled.`,
    );
  }
}

function parsePositiveInt(value: string | undefined): number | undefined {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return undefined;
  return n;
}

function parseBool(value: string | undefined): boolean | undefined {
  if (value == null || value === "") return undefined;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return undefined;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
