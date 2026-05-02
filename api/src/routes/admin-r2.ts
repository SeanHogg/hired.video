// admin-r2.ts — SuperAdmin tools for inspecting + cleaning up the R2
// video bucket. Until this landed there was no surface to see who was
// consuming storage or to remove orphaned objects (R2 keys with no
// corresponding `videos` row), which made cost monitoring and abuse
// triage manual.
//
// All routes require SuperAdmin via the shared middleware. Mounted at
// /api/admin/r2 in app.ts BEFORE the catch-all `/api/admin` mount so
// admin.ts doesn't intercept.

import { Hono } from "hono";
import { z } from "zod";

import type { Variables } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { superAdminMiddleware } from "../middleware/superAdmin.js";
import { ok } from "../utils/response.js";

// Local error envelope helper — `response.ts` only exports `ok`. Other admin
// routes (admin.ts, studio.ts) duplicate this same shape; consolidating into
// `response.ts` is a follow-up but not on this PR's critical path.
function fail(code: string, message: string, details?: unknown) {
  return {
    success: false as const,
    error: { code, message, ...(details !== undefined ? { details } : {}) },
    timestamp: new Date().toISOString(),
  };
}

export const adminR2Routes = new Hono<{ Variables: Variables }>();
adminR2Routes.use("*", superAdminMiddleware);

// ─── Helpers ────────────────────────────────────────────────────────────────

function getR2Bucket(): R2Bucket | undefined {
  return (globalThis as any).__ENV?.VIDEO_BUCKET;
}

interface R2KeyInfo {
  key: string;
  size: number;
  uploaded: string;
}

/**
 * Iterate the entire bucket (paginated via cursor). Cap at `maxKeys` so a
 * runaway scan can't burn through the whole bucket — anything beyond is
 * reported back to the caller via `truncated: true` so the UI can render
 * a "showing first N" warning.
 */
async function listAll(bucket: R2Bucket, maxKeys: number, prefix?: string): Promise<{
  objects: R2KeyInfo[];
  truncated: boolean;
}> {
  const out: R2KeyInfo[] = [];
  let cursor: string | undefined;
  let truncated = false;
  do {
    const page = await bucket.list({ cursor, prefix, limit: 1000 });
    for (const o of page.objects) {
      if (out.length >= maxKeys) {
        truncated = true;
        break;
      }
      out.push({
        key: o.key,
        size: o.size,
        uploaded: o.uploaded.toISOString(),
      });
    }
    cursor = page.truncated ? page.cursor : undefined;
    if (out.length >= maxKeys) {
      truncated = truncated || page.truncated;
      break;
    }
  } while (cursor);
  return { objects: out, truncated };
}

/** R2 keys are written as `studio/{userId}/{projectId}/...` — parse out the
 *  userId so we can roll bytes up by owner. Keys outside this convention
 *  fall under the "other" bucket so they show up in the report rather
 *  than getting silently dropped. */
export function userIdFromKey(key: string): string | "other" {
  const parts = key.split("/");
  if (parts[0] === "studio" && parts[1] && parts[1].length > 0) return parts[1];
  return "other";
}

export interface UsageBreakdownEntry {
  userId: string | "other";
  bytes: number;
  objectCount: number;
}

/** Roll up R2 object listings into per-user totals. Pure function so the
 *  rule (and the bucketing of "other") is testable without an R2 binding. */
export function summarizeByUser(objects: ReadonlyArray<{ key: string; size: number }>): UsageBreakdownEntry[] {
  const byUser = new Map<string, { bytes: number; objectCount: number }>();
  for (const obj of objects) {
    const u = userIdFromKey(obj.key);
    const cur = byUser.get(u) ?? { bytes: 0, objectCount: 0 };
    cur.bytes += obj.size;
    cur.objectCount += 1;
    byUser.set(u, cur);
  }
  return Array.from(byUser.entries())
    .map(([userId, agg]) => ({ userId: userId as string | "other", ...agg }))
    .sort((a, b) => b.bytes - a.bytes);
}

/** Subtract DB-linked R2 keys from a list of bucket objects to surface
 *  orphans (R2 contents with no `videos` row). */
export function findOrphans<T extends { key: string }>(
  objects: ReadonlyArray<T>,
  linkedKeys: ReadonlySet<string>,
): T[] {
  return objects.filter((o) => !linkedKeys.has(o.key));
}

// ─── GET /api/admin/r2/usage — bytes per user + grand total ──────────────────

adminR2Routes.get("/usage", async (c) => {
  const r2 = getR2Bucket();
  if (!r2) return c.json(fail("R2_UNAVAILABLE", "R2 binding not configured"), 500);

  const limit = Math.min(50_000, Math.max(100, Number(c.req.query("limit") ?? 10_000)));
  const { objects, truncated } = await listAll(r2, limit);

  const summary = summarizeByUser(objects);
  const totalBytes = summary.reduce((acc, s) => acc + s.bytes, 0);

  // Hydrate user names for display. Keep this a single round-trip rather
  // than per-key — the `other` synthetic bucket has no user row.
  const userIds = summary
    .map((s) => s.userId)
    .filter((id): id is string => id !== "other" && /^[0-9a-f-]{36}$/i.test(id));
  const db = getDb();
  const rows = userIds.length
    ? await db
        .select({ id: schema.users.id, email: schema.users.email, name: schema.users.name })
        .from(schema.users)
        .where(sqlInArray(schema.users.id, userIds))
    : [];
  const userMap = new Map(rows.map((r) => [r.id, r]));

  const breakdown = summary.map((s) => ({
    userId: s.userId === "other" ? null : s.userId,
    email:  s.userId === "other" ? null : userMap.get(s.userId)?.email ?? null,
    name:   s.userId === "other" ? null : userMap.get(s.userId)?.name  ?? null,
    bytes: s.bytes,
    objectCount: s.objectCount,
  }));

  return c.json(ok({
    totalBytes,
    objectCount: objects.length,
    truncated,
    breakdown,
  }));
});

// ─── GET /api/admin/r2/orphans — keys with no matching videos.r2Key ─────────

adminR2Routes.get("/orphans", async (c) => {
  const r2 = getR2Bucket();
  if (!r2) return c.json(fail("R2_UNAVAILABLE", "R2 binding not configured"), 500);

  const limit = Math.min(50_000, Math.max(100, Number(c.req.query("limit") ?? 10_000)));
  const { objects, truncated } = await listAll(r2, limit);

  // The `videos.r2Key` set is the source of truth — anything in R2 that
  // isn't here was either left behind by a failed save, replaced by a
  // re-render (the upload route stamps a new key but doesn't delete the
  // old one), or written by a since-deleted videos row.
  const db = getDb();
  const linkedRows = await db
    .select({ r2Key: schema.videos.r2Key })
    .from(schema.videos);
  const linked = new Set(linkedRows.map((r) => r.r2Key).filter((k): k is string => !!k));

  const orphans = findOrphans(objects, linked).sort((a, b) => b.size - a.size);

  const totalOrphanBytes = orphans.reduce((acc, o) => acc + o.size, 0);

  return c.json(ok({
    totalOrphanBytes,
    orphanCount: orphans.length,
    truncated,
    orphans,
  }));
});

// ─── DELETE /api/admin/r2/object?key=... — remove a specific R2 object ──────

const DeleteSchema = z.object({
  key: z.string().min(1),
});

adminR2Routes.delete("/object", async (c) => {
  const r2 = getR2Bucket();
  if (!r2) return c.json(fail("R2_UNAVAILABLE", "R2 binding not configured"), 500);

  const parsed = DeleteSchema.safeParse({ key: c.req.query("key") });
  if (!parsed.success) {
    return c.json(fail("VALIDATION_ERROR", "Missing or invalid key", parsed.error.flatten()), 400);
  }

  const { key } = parsed.data;
  const head = await r2.head(key);
  if (!head) return c.json(fail("NOT_FOUND", "Object not found"), 404);

  await r2.delete(key);
  return c.json(ok({ deleted: true, key, freedBytes: head.size }));
});

// ─── Local sql.inArray shim — avoid importing drizzle's `inArray` here ──────
// to keep this module's surface small. The real `inArray` is in `drizzle-orm`
// already imported at the call sites in admin.ts; we do the minimum here.
import { inArray as sqlInArray } from "drizzle-orm";
