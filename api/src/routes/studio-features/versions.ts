/**
 * Studio features — project version history + autosave. Mounted at /api/studio through the
 * routes/studio-features.ts barrel (split out of that file; paths unchanged).
 */
import { Hono } from "hono";
import { and, eq, desc, inArray } from "drizzle-orm";
import { z } from "zod";
import type { AppEnv } from "../../types/index.js";
import { getDb } from "../../db/index.js";
import { ok, fail, studioProjectVersions } from "./shared.js";

export const versionRoutes = new Hono<AppEnv>();

// ═══════════════════════════════════════════════════════════════════════════════
// ██  13. PROJECT VERSION HISTORY + AUTOSAVE — gap #131
// ██
// ██  Debounced autosave creates a `studio_project_versions` snapshot row.
// ██  Caps: 50 versions per project, 30-day retention. Restoring writes a
// ██  new "restored from vN" row rather than mutating history.
// ═══════════════════════════════════════════════════════════════════════════════

const VERSIONS_PER_PROJECT_CAP = 50;
const VERSION_RETENTION_DAYS = 30;

// POST /api/studio/projects/:projectId/versions — create snapshot (autosave or manual)
versionRoutes.post("/projects/:projectId/versions", async (c) => {
  const user = c.var.user;
  const projectId = c.req.param("projectId");
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({
    storyboard: z.unknown(),
    label:      z.string().max(120).optional(),
    isAutosave: z.boolean().optional(),
  }).safeParse(body);

  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid body", parsed.error.flatten()), 400);
  if (parsed.data.storyboard == null) return c.json(fail("VALIDATION_ERROR", "storyboard required"), 400);

  const db = getDb();

  // Compute next version number
  const [latest] = await db
    .select({ versionNumber: studioProjectVersions.versionNumber })
    .from(studioProjectVersions)
    .where(eq(studioProjectVersions.projectId, projectId))
    .orderBy(desc(studioProjectVersions.versionNumber))
    .limit(1);
  const nextNumber = (latest?.versionNumber ?? 0) + 1;

  const [version] = await db.insert(studioProjectVersions).values({
    projectId,
    userId: user.sub,
    versionNumber: nextNumber,
    label: parsed.data.label ?? (parsed.data.isAutosave === false ? "manual" : "autosave"),
    storyboard: parsed.data.storyboard,
    isAutosave: parsed.data.isAutosave !== false,
  } as any).returning();

  // Enforce 50-version cap and 30-day retention by deleting old AUTOSAVE rows.
  // Manual snapshots are preserved beyond the cap.
  const allAutosaves = await db
    .select({ id: studioProjectVersions.id, createdAt: studioProjectVersions.createdAt })
    .from(studioProjectVersions)
    .where(and(
      eq(studioProjectVersions.projectId, projectId),
      eq(studioProjectVersions.isAutosave, true),
    ))
    .orderBy(desc(studioProjectVersions.createdAt));

  const cutoff = Date.now() - VERSION_RETENTION_DAYS * 86400 * 1000;
  const toDelete = allAutosaves
    .filter((v, i) => i >= VERSIONS_PER_PROJECT_CAP || (v.createdAt && v.createdAt.getTime() < cutoff))
    .map((v) => v.id);

  if (toDelete.length > 0) {
    await db.delete(studioProjectVersions)
      .where(inArray(studioProjectVersions.id, toDelete));
  }

  return c.json(ok({
    id: version.id,
    versionNumber: version.versionNumber,
    label: version.label,
    isAutosave: version.isAutosave,
    createdAt: version.createdAt,
    prunedCount: toDelete.length,
  }), 201);
});

// GET /api/studio/projects/:projectId/versions — list snapshots
versionRoutes.get("/projects/:projectId/versions", async (c) => {
  const user = c.var.user;
  const projectId = c.req.param("projectId");
  const db = getDb();

  const versions = await db
    .select({
      id: studioProjectVersions.id,
      versionNumber: studioProjectVersions.versionNumber,
      label: studioProjectVersions.label,
      isAutosave: studioProjectVersions.isAutosave,
      createdAt: studioProjectVersions.createdAt,
    })
    .from(studioProjectVersions)
    .where(and(
      eq(studioProjectVersions.projectId, projectId),
      eq(studioProjectVersions.userId, user.sub),
    ))
    .orderBy(desc(studioProjectVersions.versionNumber))
    .limit(100);

  return c.json(ok({ versions }));
});

// GET /api/studio/projects/:projectId/versions/:versionId — fetch full snapshot
versionRoutes.get("/projects/:projectId/versions/:versionId", async (c) => {
  const user = c.var.user;
  const projectId = c.req.param("projectId");
  const versionId = c.req.param("versionId");
  const db = getDb();

  const [version] = await db
    .select()
    .from(studioProjectVersions)
    .where(and(
      eq(studioProjectVersions.id, versionId),
      eq(studioProjectVersions.projectId, projectId),
      eq(studioProjectVersions.userId, user.sub),
    ))
    .limit(1);

  if (!version) return c.json(fail("NOT_FOUND", "Version not found"), 404);
  return c.json(ok(version));
});

// POST /api/studio/projects/:projectId/versions/:versionId/restore
// Returns the storyboard so the caller (StudioLayout) can re-hydrate state.
// A new "restored from vN" version row is created marking the restore point.
versionRoutes.post("/projects/:projectId/versions/:versionId/restore", async (c) => {
  const user = c.var.user;
  const projectId = c.req.param("projectId");
  const versionId = c.req.param("versionId");
  const db = getDb();

  const [source] = await db
    .select()
    .from(studioProjectVersions)
    .where(and(
      eq(studioProjectVersions.id, versionId),
      eq(studioProjectVersions.projectId, projectId),
      eq(studioProjectVersions.userId, user.sub),
    ))
    .limit(1);
  if (!source) return c.json(fail("NOT_FOUND", "Version not found"), 404);

  // Compute next version number
  const [latest] = await db
    .select({ versionNumber: studioProjectVersions.versionNumber })
    .from(studioProjectVersions)
    .where(eq(studioProjectVersions.projectId, projectId))
    .orderBy(desc(studioProjectVersions.versionNumber))
    .limit(1);
  const nextNumber = (latest?.versionNumber ?? 0) + 1;

  const [restored] = await db.insert(studioProjectVersions).values({
    projectId,
    userId: user.sub,
    versionNumber: nextNumber,
    label: `restored from v${source.versionNumber}`,
    storyboard: source.storyboard,
    isAutosave: false,
  } as any).returning();

  return c.json(ok({
    restoredVersion: {
      id: restored.id,
      versionNumber: restored.versionNumber,
      label: restored.label,
      createdAt: restored.createdAt,
    },
    storyboard: source.storyboard,
  }));
});
