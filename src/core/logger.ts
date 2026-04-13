export type LogLevel = "debug" | "info" | "warn" | "error";

const SENSITIVE_KEY_RE =
  /(token|secret|authorization|cookie|password|api[_-]?key|session[_-]?key)/i;
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi;
const ATTACHMENTS_PATH_RE = /\/Users\/[^/]+\/\.hooman\/attachments\/[^\s"']+/g;

const levelWeight: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const configuredLevel =
  ((process.env.HOOMAN_LOG_LEVEL ?? "info").toLowerCase() as LogLevel) ||
  "info";
const minLevel: LogLevel = levelWeight[configuredLevel]
  ? configuredLevel
  : "info";

export function log(
  level: LogLevel,
  scope: string,
  message: string,
  metadata?: Record<string, unknown>,
): void {
  if (levelWeight[level] < levelWeight[minLevel]) {
    return;
  }

  const ts = new Date().toISOString();
  const meta = metadata ? ` ${safeStringify(metadata)}` : "";
  const line = `[${ts}] [${level.toUpperCase()}] [${scope}] ${message}${meta}`;

  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}

function safeStringify(value: Record<string, unknown>): string {
  try {
    return JSON.stringify(redactMetadata(value));
  } catch {
    return "[unserializable-metadata]";
  }
}

export function redactMetadata(value: unknown): unknown {
  return redactValue(undefined, value);
}

function redactValue(key: string | undefined, value: unknown): unknown {
  if (typeof value === "string") {
    if (key && SENSITIVE_KEY_RE.test(key)) {
      return "[REDACTED]";
    }
    return value
      .replace(BEARER_RE, "Bearer [REDACTED]")
      .replace(ATTACHMENTS_PATH_RE, "~/.hooman/attachments/[REDACTED]");
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(undefined, item));
  }

  if (value && typeof value === "object") {
    const input = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(input)) {
      out[childKey] = redactValue(childKey, childValue);
    }
    return out;
  }

  return value;
}
