import winston from "winston";

export const log = winston.createLogger({
  level: (process.env.HOOMANITY_LOG_LEVEL ?? "info").toLowerCase(),
  levels: winston.config.npm.levels,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  transports: [new winston.transports.Console()],
});
