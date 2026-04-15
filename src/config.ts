import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { IdAllowlist } from "./contracts";
import { configFilePath } from "./paths";

export type AppConfig = {
  acp: {
    cmd: string;
    cwd: string;
  };
  approvals: {
    timeout_ms: number;
  };
  slack: {
    enabled: boolean;
    token?: string;
    app_token?: string;
    require_mention: boolean;
    allowlist: IdAllowlist;
  };
  telegram: {
    enabled: boolean;
    bot_token?: string;
    require_mention: boolean;
    allowlist: IdAllowlist;
  };
  whatsapp: {
    enabled: boolean;
    session_path?: string;
    client_id?: string;
    puppeteer_executable_path?: string;
    require_mention: boolean;
    allowlist: IdAllowlist;
  };
};

type SlackAllowlistFileValue = "*" | string[];
type TelegramAllowlistFileValue = "*" | string | string[];
type WhatsAppAllowlistFileValue = "*" | string | string[];

type FileConfig = Partial<
  Omit<AppConfig, "slack" | "telegram" | "whatsapp">
> & {
  slack?: Partial<Omit<AppConfig["slack"], "allowlist">> & {
    allowlist?: SlackAllowlistFileValue;
  };
  telegram?: Partial<Omit<AppConfig["telegram"], "allowlist">> & {
    allowlist?: TelegramAllowlistFileValue;
  };
  whatsapp?: Partial<Omit<AppConfig["whatsapp"], "allowlist">> & {
    allowlist?: WhatsAppAllowlistFileValue;
  };
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const { configPath, config } = resolveConfig(env);
  validateConfig(config, configPath);
  return config;
}

export function loadEditableConfig(env: NodeJS.ProcessEnv = process.env): {
  configPath: string;
  config: AppConfig;
} {
  return resolveConfig(env);
}

export async function writeEditableConfig(
  config: AppConfig,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  const configPath = getConfigPath(env);
  const payload: FileConfig = {
    acp: {
      cmd: config.acp.cmd,
      cwd: config.acp.cwd,
    },
    approvals: {
      timeout_ms: config.approvals.timeout_ms,
    },
    slack: {
      enabled: config.slack.enabled,
      token: config.slack.token,
      app_token: config.slack.app_token,
      require_mention: config.slack.require_mention,
      allowlist: config.slack.allowlist,
    },
    telegram: {
      enabled: config.telegram.enabled,
      bot_token: config.telegram.bot_token,
      require_mention: config.telegram.require_mention,
      allowlist: config.telegram.allowlist,
    },
    whatsapp: {
      enabled: config.whatsapp.enabled,
      session_path: config.whatsapp.session_path,
      client_id: config.whatsapp.client_id,
      puppeteer_executable_path: config.whatsapp.puppeteer_executable_path,
      require_mention: config.whatsapp.require_mention,
      allowlist: config.whatsapp.allowlist,
    },
  };
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return configPath;
}

export function getConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  return env.HOOMANITY_CONFIG_PATH ?? configFilePath;
}

function resolveConfig(env: NodeJS.ProcessEnv): {
  configPath: string;
  config: AppConfig;
} {
  const configPath = getConfigPath(env);
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
    slack: {
      enabled: parseBool(env.SLACK_ENABLED) ?? fromFile.slack?.enabled ?? false,
      token: env.SLACK_TOKEN ?? fromFile.slack?.token,
      app_token: env.SLACK_APP_TOKEN ?? fromFile.slack?.app_token,
      require_mention:
        parseBool(env.SLACK_REQUIRE_MENTION) ??
        fromFile.slack?.require_mention ??
        false,
      allowlist: resolveSlackAllowlist(fromFile, configPath),
    },
    telegram: {
      enabled:
        parseBool(env.TELEGRAM_ENABLED) ?? fromFile.telegram?.enabled ?? false,
      bot_token: env.TELEGRAM_BOT_TOKEN ?? fromFile.telegram?.bot_token,
      require_mention:
        parseBool(env.TELEGRAM_REQUIRE_MENTION) ??
        fromFile.telegram?.require_mention ??
        false,
      allowlist: resolveGenericAllowlist(
        fromFile.telegram?.allowlist,
        "telegram.allowlist",
        configPath,
      ),
    },
    whatsapp: {
      enabled:
        parseBool(env.WHATSAPP_ENABLED) ?? fromFile.whatsapp?.enabled ?? false,
      session_path:
        env.WHATSAPP_SESSION_PATH ??
        fromFile.whatsapp?.session_path ??
        "default",
      client_id:
        env.WHATSAPP_CLIENT_ID ?? fromFile.whatsapp?.client_id ?? "default",
      puppeteer_executable_path:
        env.WHATSAPP_PUPPETEER_EXECUTABLE_PATH ??
        fromFile.whatsapp?.puppeteer_executable_path,
      require_mention:
        parseBool(env.WHATSAPP_REQUIRE_MENTION) ??
        fromFile.whatsapp?.require_mention ??
        false,
      allowlist: resolveGenericAllowlist(
        fromFile.whatsapp?.allowlist,
        "whatsapp.allowlist",
        configPath,
      ),
    },
  };
  return { configPath, config };
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

function resolveGenericAllowlist(
  raw: TelegramAllowlistFileValue | WhatsAppAllowlistFileValue | undefined,
  key: "telegram.allowlist" | "whatsapp.allowlist",
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

export function validateConfig(config: AppConfig, configPath: string): void {
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
    assertRequired(config.slack.token, "slack.token", configPath);
    assertRequired(config.slack.app_token, "slack.app_token", configPath);
  }
  if (config.telegram.enabled) {
    assertRequired(config.telegram.bot_token, "telegram.bot_token", configPath);
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
