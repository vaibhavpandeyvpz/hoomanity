import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import winston from "winston";
import { hoomanityLogsDir } from "../store/paths.js";

const logsDir = hoomanityLogsDir();
if (!existsSync(logsDir)) {
  mkdirSync(logsDir, { recursive: true });
}

const level =
  process.env.HOOMANITY_LOG_LEVEL ??
  (process.env.NODE_ENV === "production" ? "info" : "debug");

function serializeCause(cause: unknown): Record<string, unknown> {
  if (cause instanceof Error) {
    return {
      errMessage: cause.message,
      errName: cause.name,
      stack: cause.stack,
    };
  }
  if (cause !== undefined && cause !== null) {
    return { detail: String(cause) };
  }
  return {};
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    !(v instanceof Error)
  );
}

const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json(),
);

const logger = winston.createLogger({
  level,
  transports: [
    new winston.transports.File({
      filename: join(logsDir, "hoomanity.log"),
      format: fileFormat,
    }),
  ],
});

/**
 * Application logging: `~/.hoomanity/logs/hoomanity.log` (JSON lines).
 * Import this module instead of `winston` or `console` for app messages.
 */
export const log = {
  info(message: string, meta?: Record<string, unknown>): void {
    if (meta && Object.keys(meta).length > 0) {
      logger.info(message, meta);
    } else {
      logger.info(message);
    }
  },

  warn(message: string, second?: unknown): void {
    if (second === undefined) {
      logger.warn(message);
      return;
    }
    if (isPlainObject(second)) {
      logger.warn(message, second);
      return;
    }
    logger.warn(message, serializeCause(second));
  },

  error(message: string, cause?: unknown): void {
    if (cause === undefined) {
      logger.error(message);
      return;
    }
    logger.error(message, serializeCause(cause));
  },

  debug(message: string, meta?: Record<string, unknown>): void {
    if (meta && Object.keys(meta).length > 0) {
      logger.debug(message, meta);
    } else {
      logger.debug(message);
    }
  },
} as const;
