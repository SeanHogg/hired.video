/**
 * Pure handler for extension telemetry batch ingestion.
 *
 * Extracted from `routes/extension.ts` so the request-routing + auth +
 * rate-limit layer stays thin and the upsert + counter-rollup logic is
 * unit-testable against a fake DB (no Hono context, no Cloudflare bindings,
 * no real Postgres).
 *
 * The route file owns the HTTP shape (Zod validate, 429, 413, 202); this
 * file owns the data shape contract + write semantics.
 */

import { eq, sql } from "drizzle-orm";
import type { getDb } from "../../db/index.js";
import { schema } from "../../db/index.js";

export const EVENT_KINDS = [
  "page_view",
  "detect_attempt",
  "picker_capture",
  "track",
  "error",
  "navigation",
  "manual",
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export interface IngestEvent {
  kind: EventKind;
  ts?: string;
  url?: string;
  host?: string;
  payload?: Record<string, unknown>;
}

export interface IngestBatch {
  sessionId: string;
  extension: "jobseeker" | "recruiter";
  version?: string;
  events: IngestEvent[];
}

export interface IngestMeta {
  userId: string | null;
  userAgent: string | null;
  ip: string | null;
}

export interface IngestDeps {
  db: ReturnType<typeof getDb>;
}

export interface IngestResult {
  accepted: number;
  sessionRowId: string;
  /** True when the session row was created in this call; false when an
   *  existing row was upserted into. Useful for telemetry-of-telemetry. */
  createdSession: boolean;
}

/**
 * Per-event payload size cap. Individual `picker_capture` events may
 * carry an `outerHTML` snippet up to ~8KB; with surrounding fields the
 * shape stays well under this cap. Inflated payloads are replaced with
 * a marker so the DB can never balloon from a single rogue capture.
 */
export const PER_EVENT_PAYLOAD_CAP_BYTES = 64_000;

/**
 * Upsert the session row + append every event + roll up the session
 * counters in a single call. Idempotent on `clientSessionId` so a
 * retried batch never double-creates the session.
 */
export async function handleIngestExtensionBatch(
  deps: IngestDeps,
  batch: IngestBatch,
  meta: IngestMeta,
): Promise<IngestResult> {
  const { db } = deps;

  // ── Upsert session — idempotent on clientSessionId ────────────────────
  const existing = await db
    .select({ id: schema.extensionSessions.id })
    .from(schema.extensionSessions)
    .where(eq(schema.extensionSessions.clientSessionId, batch.sessionId))
    .limit(1);

  let sessionRowId: string;
  let createdSession = false;
  if (existing.length > 0) {
    sessionRowId = existing[0].id;
  } else {
    const inserted = await db
      .insert(schema.extensionSessions)
      .values({
        clientSessionId: batch.sessionId,
        userId: meta.userId,
        extension: batch.extension,
        version: batch.version ?? null,
        userAgent: meta.userAgent,
        ipAddress: meta.ip,
      })
      .returning({ id: schema.extensionSessions.id });
    sessionRowId = inserted[0].id;
    createdSession = true;
  }

  // ── Build event rows (with per-payload size cap) ──────────────────────
  const eventRows = batch.events.map((ev) => {
    let payload: Record<string, unknown> | { _truncated: true; _originalSize: number } | null =
      ev.payload ?? null;
    if (payload) {
      const serialized = JSON.stringify(payload);
      if (serialized.length > PER_EVENT_PAYLOAD_CAP_BYTES) {
        payload = { _truncated: true, _originalSize: serialized.length };
      }
    }
    return {
      sessionId: sessionRowId,
      kind: ev.kind,
      url: ev.url ?? null,
      host: ev.host ?? null,
      payload,
    };
  });

  if (eventRows.length > 0) {
    await db.insert(schema.extensionEvents).values(eventRows);
  }

  // ── Roll up session counters ─────────────────────────────────────────
  const newErrors = eventRows.filter((e) => e.kind === "error").length;
  const newCaptures = eventRows.filter((e) => e.kind === "picker_capture").length;
  await db
    .update(schema.extensionSessions)
    .set({
      eventCount: sql`${schema.extensionSessions.eventCount} + ${eventRows.length}`,
      errorCount: sql`${schema.extensionSessions.errorCount} + ${newErrors}`,
      pickerCaptureCount: sql`${schema.extensionSessions.pickerCaptureCount} + ${newCaptures}`,
      updatedAt: new Date(),
    })
    .where(eq(schema.extensionSessions.id, sessionRowId));

  // ── Late binding: attach user if session was previously anonymous ────
  // No-op when userId is already set or the caller is also anonymous.
  if (meta.userId) {
    await db
      .update(schema.extensionSessions)
      .set({ userId: meta.userId })
      .where(
        sql`${schema.extensionSessions.id} = ${sessionRowId} AND ${schema.extensionSessions.userId} IS NULL`,
      );
  }

  return { accepted: eventRows.length, sessionRowId, createdSession };
}
