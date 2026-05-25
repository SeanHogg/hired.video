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
import type { Variables, AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb } from "../db/index.js";
import { optionalAuthMiddleware } from "../middleware/auth.js";
import { createIpRateLimiter, getClientIp } from "../middleware/rateLimiter.js";
import { EVENT_KINDS, handleIngestExtensionBatch } from "../services/extension/ingest.js";

// ── Schemas ────────────────────────────────────────────────────────────────
// Event-kind union lives in services/extension/ingest.ts (the canonical
// shape) so the route schema and the handler can't drift.

const EventSchema = z.object({
  kind: z.enum(EVENT_KINDS),
  // ISO timestamp from the client; server still stamps its own
  // createdAt — this just orders within a batch.
  ts: z.string().datetime().optional(),
  url: z.string().max(2048).optional(),
  host: z.string().max(255).optional(),
  // Payload contract per-kind. Server doesn't validate the shape — we
  // accept any JSON-serializable object and store as JSONB so we can
  // evolve the client without DB changes. Per-event cap enforced by
  // handleIngestExtensionBatch (PER_EVENT_PAYLOAD_CAP_BYTES).
  payload: z.record(z.string(), z.unknown()).optional(),
});

export const BatchSchema = z.object({
  sessionId: z.string().uuid(),
  extension: z.enum(["jobseeker", "recruiter"]),
  version: z.string().max(32).optional(),
  events: z.array(EventSchema).min(1).max(200),
});

// ── Rate limit ─────────────────────────────────────────────────────────────
// 60/min per IP — ~one batch per second, far above a real user pattern
// (the client flushes on 25-event threshold + 15s timer + visibilitychange).
// Uses the shared createIpRateLimiter factory.

const ingestRateLimiter = createIpRateLimiter({
  windowMs: 60 * 1000,
  maxAttempts: 60,
  message: "Too many extension telemetry posts.",
});

// ── Router ─────────────────────────────────────────────────────────────────

export const extensionRoutes = new Hono<AppEnv>();

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

    const ip = getClientIp(c);
    const result = await handleIngestExtensionBatch(
      { db: getDb() },
      parsed.data,
      {
        userId: (c.var.user?.sub as string | undefined) ?? null,
        userAgent: c.req.header("user-agent") ?? null,
        ip: ip === "unknown" ? null : ip,
      },
    );

    return c.json(success({ accepted: result.accepted }), 202);
  },
);
