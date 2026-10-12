// admin-r2.ts — SuperAdmin tools for inspecting + cleaning up the R2
// video bucket. Until this landed there was no surface to see who was
// consuming storage or to remove orphaned objects (R2 keys with no
// corresponding DB row), which made cost monitoring and abuse
// triage manual.
//
// All routes require SuperAdmin via the shared middleware. Mounted at
// /api/admin/r2 in app.ts BEFORE the catch-all `/api/admin` mount so
// admin.ts doesn't intercept.
//
// The owner-derivation, DB-key column registry, and orphan classifier all
// live in services/storage/r2-keys.ts so this file is just the HTTP shell.

import { Hono } from "hono";
import { z } from "zod";
import { inArray } from "drizzle-orm";

import type { Variables, AppEnv } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { superAdminMiddleware } from "../middleware/superAdmin.js";
import { ok } from "../utils/response.js";
import {
  classifyOrphans,
  loadDbLinkedKeys,
  loadLiveUserIds,
  summarizeByUser,
  deriveOwner,
} from "../services/storage/r2-keys.js";
import { getVideoBucket } from "../services/storage/object-store.js";

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

export const adminR2Routes = new Hono<AppEnv>();
adminR2Routes.use("*", superAdminMiddleware);

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

// ─── GET /api/admin/r2/usage — bytes per user + grand total ──────────────────

adminR2Routes.get("/usage", async (c) => {
  const r2 = getVideoBucket();
  if (!r2) return c.json(fail("R2_UNAVAILABLE", "R2 binding not configured"), 500);

  const limit = Math.min(50_000, Math.max(100, Number(c.req.query("limit") ?? 10_000)));
  const { objects, truncated } = await listAll(r2, limit);

  const summary = summarizeByUser(objects);
  const totalBytes = summary.reduce((acc, s) => acc + s.bytes, 0);

  // Hydrate user names for display. Keep this a single round-trip rather
  // than per-key — the synthetic `other` / `shared` buckets have no user row.
  const userIds = summary
    .map((s) => s.userId)
    .filter((id): id is string => id !== "other" && id !== "shared" && /^[0-9a-f-]{36}$/i.test(id));
  const db = getDb();
  const rows = userIds.length
    ? await db
        .select({ id: schema.users.id, email: schema.users.email, name: schema.users.name })
        .from(schema.users)
        .where(inArray(schema.users.id, userIds))
    : [];
  const userMap = new Map(rows.map((r) => [r.id, r]));

  const breakdown = summary.map((s) => {
    const isUser = s.userId !== "other" && s.userId !== "shared";
    return {
      userId: isUser ? s.userId : null,
      bucketKind: isUser ? "user" : s.userId, // "user" | "other" | "shared"
      email: isUser ? userMap.get(s.userId)?.email ?? null : null,
      name:  isUser ? userMap.get(s.userId)?.name  ?? null : null,
      bytes: s.bytes,
      objectCount: s.objectCount,
    };
  });

  return c.json(ok({
    totalBytes,
    objectCount: objects.length,
    truncated,
    breakdown,
  }));
});

// ─── GET /api/admin/r2/orphans — keys with no owning DB row AND no live user ─

adminR2Routes.get("/orphans", async (c) => {
  const r2 = getVideoBucket();
  if (!r2) return c.json(fail("R2_UNAVAILABLE", "R2 binding not configured"), 500);

  const limit = Math.min(50_000, Math.max(100, Number(c.req.query("limit") ?? 10_000)));
  const { objects, truncated } = await listAll(r2, limit);

  const db = getDb();
  // 1. Every R2 key persisted anywhere in the DB (UNION across the columns
  //    registered in services/storage/r2-keys.ts). Per-table failures are
  //    captured rather than thrown so a missing table (e.g. a migration
  //    that hasn't run yet) doesn't 500 the whole admin page.
  const { keys: linked, errors: dbErrors } = await loadDbLinkedKeys(db);
  // 2. Every path-encoded owner segment that appears in the bucket. If the
  //    user exists, the object is theirs even if no DB row tracks the key
  //    (e.g. `uploads/{userId}/files/...` is intentionally not persisted).
  const candidateUserIds = objects
    .map((o) => deriveOwner(o.key).userId)
    .filter((u): u is string => !!u);
  const liveUserIds = await loadLiveUserIds(db, candidateUserIds);

  const { orphans, reasons } = classifyOrphans(objects, linked, liveUserIds);
  orphans.sort((a, b) => b.size - a.size);

  const totalOrphanBytes = orphans.reduce((acc, o) => acc + o.size, 0);

  return c.json(ok({
    totalOrphanBytes,
    orphanCount: orphans.length,
    truncated,
    orphans: orphans.map((o) => ({ ...o, reason: reasons.get(o.key) ?? null })),
    dbErrors,
  }));
});

// ─── POST /api/admin/r2/objects/bulk-delete — single OR batched delete ──────
//
// One endpoint serves both the per-row trash button and the select-all bulk
// action. HEADs each key first so the response can report actual freed bytes
// (and skip already-gone keys without erroring the rest of the batch).

const BulkDeleteSchema = z.object({
  keys: z.array(z.string().min(1)).min(1).max(500),
});

adminR2Routes.post("/objects/bulk-delete", async (c) => {
  const r2 = getVideoBucket();
  if (!r2) return c.json(fail("R2_UNAVAILABLE", "R2 binding not configured"), 500);

  const body = await c.req.json().catch(() => null);
  const parsed = BulkDeleteSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(fail("VALIDATION_ERROR", "Bad payload", parsed.error.flatten()), 400);
  }

  const results: Array<{ key: string; deleted: boolean; freedBytes: number; error?: string }> = [];
  let totalFreed = 0;
  let deletedCount = 0;

  for (const key of parsed.data.keys) {
    try {
      const head = await r2.head(key);
      if (!head) {
        results.push({ key, deleted: false, freedBytes: 0, error: "not_found" });
        continue;
      }
      await r2.delete(key);
      totalFreed += head.size;
      deletedCount += 1;
      results.push({ key, deleted: true, freedBytes: head.size });
    } catch (e) {
      results.push({ key, deleted: false, freedBytes: 0, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return c.json(ok({
    requested: parsed.data.keys.length,
    deletedCount,
    totalFreedBytes: totalFreed,
    results,
  }));
});
