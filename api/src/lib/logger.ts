/**
 * Structured JSON logger for Cloudflare Workers.
 * Emits newline-delimited JSON to stdout so Cloudflare Logpush and
 * tail workers can ingest, filter, and forward to Datadog/Logtail/etc.
 *
 * Usage:
 *   import { logger } from "../lib/logger.js";
 *   logger.info("request completed", { path, durationMs });
 *   logger.error("db query failed", { error: err.message, query });
 */

import { getRelease } from "../utils/release.js";

type Level = "debug" | "info" | "warn" | "error";

interface LogRecord {
  level: Level;
  message: string;
  timestamp: string;
  [key: string]: unknown;
}

function emit(level: Level, message: string, fields: Record<string, unknown> = {}): void {
  const record: LogRecord = {
    level,
    message,
    timestamp: new Date().toISOString(),
    // Deployed version, so a Workers Logs line ties to the code that wrote it.
    release: getRelease()?.id ?? null,
    ...fields,
  };
  const line = JSON.stringify(record);
  if (level === "error" || level === "warn") {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (message: string, fields?: Record<string, unknown>) => emit("debug", message, fields),
  info:  (message: string, fields?: Record<string, unknown>) => emit("info",  message, fields),
  warn:  (message: string, fields?: Record<string, unknown>) => emit("warn",  message, fields),
  error: (message: string, fields?: Record<string, unknown>) => emit("error", message, fields),
};
