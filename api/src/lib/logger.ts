/**
 * Structured JSON logger for Cloudflare Workers — the ONE way api/src logs.
 * Emits newline-delimited JSON so Cloudflare Logpush / Workers Logs / tail
 * workers can ingest, filter and forward it.
 *
 * Usage:
 *   import { logger } from "../lib/logger.js";
 *   logger.info("request completed", { path, durationMs });
 *   logger.error("db query failed", err);                 // an Error / unknown
 *   logger.warn("[stripe] webhook retry", { eventId, error: err });
 *
 * The second argument may be a fields object or any thrown value. Error
 * instances (top-level or as a field value) are serialised to
 * `{ name, message, stack }` — `JSON.stringify(new Error())` is `{}`, which
 * is why raw `console.error("…", err)` lines used to lose the cause.
 */

import { getRelease } from "../utils/release.js";

type Level = "debug" | "info" | "warn" | "error";

interface LogRecord {
  level: Level;
  message: string;
  timestamp: string;
  [key: string]: unknown;
}

export function serializeError(err: unknown): unknown {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return err;
}

function toFields(detail: unknown): Record<string, unknown> {
  if (detail === undefined) return {};
  if (detail instanceof Error) return { error: serializeError(detail) };
  if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(detail as Record<string, unknown>)) out[k] = serializeError(v);
    return out;
  }
  return { detail };
}

function safeStringify(record: LogRecord): string {
  try {
    return JSON.stringify(record);
  } catch {
    // Circular / BigInt payloads must never crash the request that logs them.
    return JSON.stringify({ level: record.level, message: record.message, timestamp: record.timestamp, unserializable: true });
  }
}

function emit(level: Level, message: string, detail?: unknown): void {
  const record: LogRecord = {
    level,
    message,
    timestamp: new Date().toISOString(),
    // Deployed version, so a Workers Logs line ties to the code that wrote it.
    release: getRelease()?.id ?? null,
    ...toFields(detail),
  };
  const line = safeStringify(record);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (message: string, detail?: unknown) => emit("debug", message, detail),
  info: (message: string, detail?: unknown) => emit("info", message, detail),
  warn: (message: string, detail?: unknown) => emit("warn", message, detail),
  error: (message: string, detail?: unknown) => emit("error", message, detail),
};
