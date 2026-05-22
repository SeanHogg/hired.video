/**
 * /api/extension/sessions — Chrome extension telemetry ingestion.
 *
 * Single batch endpoint. The extension batches events locally and posts
 * them on visibilitychange / unload / 10-event threshold. The server
 * upserts the session row (idempotent on `clientSessionId`) and appends
 * every event. We don't enforce "session must exist first" — the first
 * batch ever seen for a session both creates and writes to it.
 *
 * Auth is optional. We allow anonymous (signed-out) posts because the
 * highest-value capture is "extension couldn't detect job on linkedin.com
 * because user wasn't logged in and the public preview layout differs" —
 * losing that capture is a defection bug, not a security feature.
 *
 * Modelled after `routes/errors.ts` — Zod schema, per-IP rate limit,
 * generous body cap (200KB to fit a focused-pane HTML snippet, capped
 * here to prevent malicious payloads from filling the DB).
 *
 * SEE ALSO: routes/superadmin/extension.ts for the admin viewer surface.
 */

import { Hono } from "hono";
import { z } from "zod";
import type { MiddlewareHandler } from "hono";
import { eq, sql } from "drizzle-orm";
import type { Variables } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { optionalAuthMiddleware } from "../middleware/auth.js";

// ── Schemas ────────────────────────────────────────────────────────────────

const EVENT_KINDS = [
  "page_view",
  "detect_attempt",
  "picker_capture",
  "track",
  "error",
  "navigation",
  "manual",
] as const;

const EventSchema = z.object({
  kind: z.enum(EVENT_KINDS),
  // ISO timestamp from the client; server still stamps its own
  // createdAt — this just orders within a batch.
  ts: z.string().datetime().optional(),
  url: z.string().max(2048).optional(),
  host: z.string().max(255).optional(),
  // Payload contract per-kind. Server doesn't validate the shape — we
  // accept any JSON-serializable object and store as JSONB so we can
  // evolve the client without DB changes. Cap at 64KB serialized.
  payload: z.record(z.string(), z.unknown()).optional(),
});

const BatchSchema = z.object({
  sessionId: z.string().uuid(),
  extension: z.enum(["jobseeker", "recruiter"]),
  version: z.string().max(32).optional(),
  events: z.array(EventSchema).min(1).max(200),
});

type Batch = z.infer<typeof BatchSchema>;

// ── Rate limit ─────────────────────────────────────────────────────────────

interface BucketEntry {
  count: number;
  resetAt: number;
}
const ingestBucket = new Map<string, BucketEntry>();
const INGEST_WINDOW_MS = 60 * 1000; // 1 min
const INGEST_MAX_PER_MIN = 60; // ~ a batch per second; far above a real user

function clientIp(c: any): string {
  const cf = c.req.header("CF-Connecting-IP");
  if (cf) return cf.trim();
  const xff = c.req.header("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return "unknown";
}

const ingestRateLimiter: MiddlewareHandler<{ Variables: Variables }> = async (c, next) => {
  const ip = clientIp(c);
  const now = Date.now();
  const entry = ingestBucket.get(ip);
  if (!entry || now > entry.resetAt) {
    ingestBucket.set(ip, { count: 1, resetAt: now + INGEST_WINDOW_MS });
    return next();
  }
  entry.count += 1;
  if (entry.count > INGEST_MAX_PER_MIN) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    c.res.headers.set("Retry-After", String(retryAfter));
    return c.json(error("TOO_MANY_REQUESTS", "Too many extension telemetry posts."), 429);
  }
  return next();
};

// ── Router ─────────────────────────────────────────────────────────────────

export const extensionRoutes = new Hono<{ Variables: Variables }>();

extensionRoutes.post(
  "/sessions",
  ingestRateLimiter,
  optionalAuthMiddleware,
  async (c) => {
    const lengthHeader = c.req.header("content-length");
    if (lengthHeader && Number(lengthHeader) > 200_000) {
      return c.json(error("PAYLOAD_TOO_LARGE", "Telemetry batch too large."), 413);
    }

    const raw = await c.req.json().catch(() => null);
    const parsed = BatchSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json(error("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid batch"), 400);
    }
    const batch: Batch = parsed.data;
    const userId = (c.var.user?.sub as string | undefined) ?? null;
    const userAgent = c.req.header("user-agent") ?? null;
    const ip = clientIp(c);

    const db = getDb();

    // Upsert session — idempotent on clientSessionId so a retried batch
    // doesn't double-create.
    const existing = await db
      .select({ id: schema.extensionSessions.id })
      .from(schema.extensionSessions)
      .where(eq(schema.extensionSessions.clientSessionId, batch.sessionId))
      .limit(1);

    let sessionRowId: string;
    if (existing.length > 0) {
      sessionRowId = existing[0].id;
    } else {
      const inserted = await db
        .insert(schema.extensionSessions)
        .values({
          clientSessionId: batch.sessionId,
          userId: userId ?? null,
          extension: batch.extension,
          version: batch.version ?? null,
          userAgent,
          ipAddress: ip === "unknown" ? null : ip,
        })
        .returning({ id: schema.extensionSessions.id });
      sessionRowId = inserted[0].id;
    }

    // Cap individual payload size — protects the DB from one rogue
    // capture inflating to MB.
    const eventRows = batch.events.map((ev) => {
      let payload = ev.payload ?? null;
      if (payload) {
        const serialized = JSON.stringify(payload);
        if (serialized.length > 64_000) {
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

    await db.insert(schema.extensionEvents).values(eventRows);

    // Roll up counters on the session row so the admin list can sort
    // without aggregating events every request.
    const newErrors = eventRows.filter((e) => e.kind === "error").length;
    const newCaptures = eventRows.filter((e) => e.kind === "picker_capture").length;
    await db
      .update(schema.extensionSessions)
      .set({
        eventCount: sql`${schema.extensionSessions.eventCount} + ${eventRows.length}`,
        errorCount: sql`${schema.extensionSessions.errorCount} + ${newErrors}`,
        pickerCaptureCount: sql`${schema.extensionSessions.pickerCaptureCount} + ${newCaptures}`,
        updatedAt: new Date(),
        // Late binding: if the first batch was anonymous and a later one
        // arrives with auth, attach the user (don't overwrite an existing
        // userId — could span multiple machines).
        ...(userId && existing.length === 0 ? {} : {}),
      })
      .where(eq(schema.extensionSessions.id, sessionRowId));

    if (userId) {
      // Best-effort: attach the user if the session is currently
      // anonymous. No-op when user_id is already set.
      await db
        .update(schema.extensionSessions)
        .set({ userId })
        .where(
          sql`${schema.extensionSessions.id} = ${sessionRowId} AND ${schema.extensionSessions.userId} IS NULL`,
        );
    }

    return c.json(success({ accepted: eventRows.length }), 202);
  },
);
