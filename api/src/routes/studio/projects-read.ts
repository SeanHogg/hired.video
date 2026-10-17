/**
 * Studio project reads (W2-3a split of routes/studio.ts):
 *   GET /api/studio/projects                         — the caller's projects (?subjectKind&subjectId, ?workspace, ?fields)
 *   GET /api/studio/projects/:projectId              — single-project hydration (v2 editor)
 *   GET /api/studio/status/:projectId                — legacy render poll (Chrome extension only)
 *   GET /api/studio/projects/:projectId/publications — where the project is published (#1920)
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { STUDIO_PROJECT_LIST_FIELDS, parseFields, projectRows } from "../../../../shared/projection.js";
import {
  getLegacyProjectStatus,
  getReadableProject,
  listProjectPublications,
  listProjects,
} from "../../services/studio/project-queries.js";
import { ok, studioErrorResponse } from "./http.js";

export const studioProjectReadRoutes = new Hono<AppEnv>();

studioProjectReadRoutes.get("/projects", async (c) => {
  const dtos = await listProjects(c.var.user.sub, {
    subjectKind: c.req.query("subjectKind"),
    subjectId: c.req.query("subjectId"),
    workspace: c.req.query("workspace"),
  });
  // `?fields=` trims each row for list views (the full DTO carries every
  // editor state blob).
  const fields = parseFields(c.req.query("fields"), STUDIO_PROJECT_LIST_FIELDS);
  return c.json(ok(projectRows(dtos as Array<Record<string, unknown>>, fields)));
});

// Readable by owner / company member / delegated grantee; 404 (not 403)
// otherwise so ids can't be enumerated.
studioProjectReadRoutes.get("/projects/:projectId", async (c) => {
  try {
    return c.json(ok(await getReadableProject(c.var.user.sub, c.req.param("projectId"))));
  } catch (e) {
    return studioErrorResponse(c, e);
  }
});

// Extension-only alias: the published Chrome extension polls this for render
// progress (owner-only, its original { id, status, progressPercentage,
// youtubeVideoId, videoUrl, renderUrl, errorMessage } shape). Same use-case
// load as GET /projects/:projectId; new clients use that route.
// DEPRECATED alias for extension <= current version — remove after next CWS release
studioProjectReadRoutes.get("/status/:projectId", async (c) => {
  try {
    return c.json(ok(await getLegacyProjectStatus(c.var.user.sub, c.req.param("projectId"))));
  } catch (e) {
    return studioErrorResponse(c, e);
  }
});

studioProjectReadRoutes.get("/projects/:projectId/publications", async (c) => {
  try {
    return c.json(ok(await listProjectPublications(c.var.user.sub, c.req.param("projectId"))));
  } catch (e) {
    return studioErrorResponse(c, e);
  }
});
