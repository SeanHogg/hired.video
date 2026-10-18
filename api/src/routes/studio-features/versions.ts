/**
 * Studio features — project version history + autosave. Mounted at /api/studio through the
 * routes/studio-features.ts barrel (split out of that file; paths unchanged).
 */
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../types/index.js";
import { UUID_LIKE_REGEX } from "../../../../shared/validation.js";
import type { EntityVersionRow } from "../../repositories/entityVersionRepository.js";
import { liveEntityVersions } from "../../services/studio/project-versions.js";
import { success, error } from "../../types/index.js";
import { validateJson } from "../helpers/validate.js";

export const versionRoutes = new Hono<AppEnv>();

// ═══════════════════════════════════════════════════════════════════════════════
// ██  13. PROJECT VERSION HISTORY + AUTOSAVE — gap #131
// ██
// ██  Debounced autosave (solo + collab rooms) creates an `entity_versions`
// ██  snapshot row (subject_type 'studio_project', W3-E migration 0640; was
// ██  studio_project_versions). Caps: 50 autosaves per project, 30-day
// ██  retention. Restoring writes a new "restored from vN" row rather than
// ██  mutating history.
// ═══════════════════════════════════════════════════════════════════════════════

const SUBJECT = "studio_project" as const;
const VERSIONS_PER_PROJECT_CAP = 50;
const VERSION_RETENTION_DAYS = 30;

/** `subject_id` is a uuid column — a malformed id can never match a project. */
const isProjectId = (id: string) => UUID_LIKE_REGEX.test(id);

/** An `entity_versions` studio row in the old studio_project_versions response shape. */
function toProjectVersion(row: EntityVersionRow) {
  return {
    id: row.id,
    projectId: row.subjectId,
    userId: row.userId,
    versionNumber: row.versionNumber,
    label: row.label,
    storyboard: row.payload,
    isAutosave: row.isAutosave,
    createdAt: row.createdAt,
  };
}

// POST /api/studio/projects/:projectId/versions — create snapshot (autosave or manual)
versionRoutes.post("/projects/:projectId/versions", validateJson(z.object({
    storyboard: z.unknown(),
    label:      z.string().max(120).optional(),
    isAutosave: z.boolean().optional(),
  }), (e) => error("VALIDATION_ERROR", "Invalid body", e.flatten()), { emptyBody: null }), async (c) => {
  const user = c.var.user;
  const projectId = c.req.param("projectId");
  const body = c.req.valid("json");

  if (body.storyboard == null) return c.json(error("VALIDATION_ERROR", "storyboard required"), 400);
  if (!isProjectId(projectId)) return c.json(error("VALIDATION_ERROR", "Invalid project id"), 400);

  // Enforce 50-version cap and 30-day retention by deleting old AUTOSAVE rows
  // (manual snapshots are preserved beyond the cap) — in the SAME round-trip
  // as the insert.
  const { row: version, prunedCount } = await liveEntityVersions().insertNextAndPrune(
    {
      subjectType: SUBJECT,
      subjectId: projectId,
      userId: user.sub,
      label: body.label ?? (body.isAutosave === false ? "manual" : "autosave"),
      payload: body.storyboard,
      isAutosave: body.isAutosave !== false,
    },
    { cap: VERSIONS_PER_PROJECT_CAP, retentionDays: VERSION_RETENTION_DAYS },
  );

  return c.json(success({
    id: version.id,
    versionNumber: version.versionNumber,
    label: version.label,
    isAutosave: version.isAutosave,
    createdAt: version.createdAt,
    prunedCount,
  }), 201);
});

// GET /api/studio/projects/:projectId/versions — list snapshots
versionRoutes.get("/projects/:projectId/versions", async (c) => {
  const user = c.var.user;
  const projectId = c.req.param("projectId");
  if (!isProjectId(projectId)) return c.json(success({ versions: [] }));

  const versions = await liveEntityVersions().list(SUBJECT, projectId, { userId: user.sub, limit: 100 });
  return c.json(success({ versions }));
});

// GET /api/studio/projects/:projectId/versions/:versionId — fetch full snapshot
versionRoutes.get("/projects/:projectId/versions/:versionId", async (c) => {
  const user = c.var.user;
  const projectId = c.req.param("projectId");
  const versionId = c.req.param("versionId");
  if (!isProjectId(projectId) || !UUID_LIKE_REGEX.test(versionId)) {
    return c.json(error("NOT_FOUND", "Version not found"), 404);
  }

  const version = await liveEntityVersions().find(SUBJECT, projectId, versionId, { userId: user.sub });
  if (!version) return c.json(error("NOT_FOUND", "Version not found"), 404);
  return c.json(success(toProjectVersion(version)));
});

// POST /api/studio/projects/:projectId/versions/:versionId/restore
// Returns the storyboard so the caller (StudioLayout) can re-hydrate state.
// A new "restored from vN" version row is created marking the restore point.
versionRoutes.post("/projects/:projectId/versions/:versionId/restore", async (c) => {
  const user = c.var.user;
  const projectId = c.req.param("projectId");
  const versionId = c.req.param("versionId");
  if (!isProjectId(projectId) || !UUID_LIKE_REGEX.test(versionId)) {
    return c.json(error("NOT_FOUND", "Version not found"), 404);
  }

  const repo = liveEntityVersions();
  const source = await repo.find(SUBJECT, projectId, versionId, { userId: user.sub });
  if (!source) return c.json(error("NOT_FOUND", "Version not found"), 404);

  const restored = await repo.insertNext({
    subjectType: SUBJECT,
    subjectId: projectId,
    userId: user.sub,
    label: `restored from v${source.versionNumber}`,
    payload: source.payload,
    isAutosave: false,
  });

  return c.json(success({
    restoredVersion: {
      id: restored.id,
      versionNumber: restored.versionNumber,
      label: restored.label,
      createdAt: restored.createdAt,
    },
    storyboard: source.payload,
  }));
});
