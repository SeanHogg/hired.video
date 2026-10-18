/**
 * Studio features — video chapters + TOC. Mounted at /api/studio through the
 * routes/studio-features.ts barrel (split out of that file; paths unchanged).
 * Use cases live in services/studio/chapters.ts.
 */
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../types/index.js";
import { resolveActableEngagementRow } from "../../services/studio/engagement-row-access.js";
import {
  deleteChapter,
  listProjectChapters,
  projectChaptersYoutubeText,
  saveProjectChapters,
  updateChapter,
} from "../../services/studio/chapters.js";
import { viewerCanActOnProject } from "./shared.js";
import { success, error } from "../../types/index.js";
import { validateJson } from "../helpers/validate.js";
import { requireUser } from "../helpers/routerHelpers.js";

export const chapterRoutes = new Hono<AppEnv>();

// ═══════════════════════════════════════════════════════════════════════════════
// ██  14. VIDEO CHAPTERS + TOC — gap #141
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/studio/projects/:projectId/chapters
chapterRoutes.get("/projects/:projectId/chapters", async (c) => {
  const projectId = c.req.param("projectId");
  if (!(await viewerCanActOnProject(c.var.userId, projectId))) {
    return c.json(error("NOT_FOUND", "Project not found"), 404);
  }
  return c.json(success({ chapters: await listProjectChapters(projectId) }));
});

// POST /api/studio/projects/:projectId/chapters — create or replace full chapter list
// Body: { chapters: Array<{ title, startSeconds, thumbnailUrl? }> }
chapterRoutes.post("/projects/:projectId/chapters", validateJson(z.object({
    chapters: z.array(z.object({
      title:        z.string().min(1).max(120),
      startSeconds: z.number().min(0),
      thumbnailUrl: z.string().url().optional(),
    })).max(200),
    replace: z.boolean().default(true),
  }), (e) => error("VALIDATION_ERROR", "Invalid body", e.flatten()), { emptyBody: null }), async (c) => {
  const userId = requireUser(c);
  const projectId = c.req.param("projectId");
  const body = c.req.valid("json");

  // Chapters feed the PUBLIC engagement read — only someone who may act on
  // the project may write them (unknown / forbidden → 404, no leak).
  if (!(await viewerCanActOnProject(userId, projectId))) {
    return c.json(error("NOT_FOUND", "Project not found"), 404);
  }

  const chapters = await saveProjectChapters(userId, projectId, body.chapters, body.replace);
  return chapters.length === 0
    ? c.json(success({ chapters: [] }))
    : c.json(success({ chapters }), 201);
});

// PATCH /api/studio/chapters/:id — edit a single chapter
chapterRoutes.patch("/chapters/:id", validateJson(z.object({
    title:        z.string().min(1).max(120).optional(),
    startSeconds: z.number().min(0).optional(),
    thumbnailUrl: z.string().url().nullable().optional(),
  }), () => error("VALIDATION_ERROR", "Invalid body"), { emptyBody: null }), async (c) => {
  const userId = requireUser(c);
  const id = c.req.param("id");
  // Authorised through the row's project (owner / company / delegate).
  const access = await resolveActableEngagementRow(userId, "chapter", id);
  if (!access) return c.json(error("NOT_FOUND", "Chapter not found"), 404);

  const updated = await updateChapter(access.projectId, id, c.req.valid("json"));
  if (!updated) return c.json(error("NOT_FOUND", "Chapter not found"), 404);
  return c.json(success(updated));
});

// DELETE /api/studio/chapters/:id
chapterRoutes.delete("/chapters/:id", async (c) => {
  const userId = requireUser(c);
  const id = c.req.param("id");
  const access = await resolveActableEngagementRow(userId, "chapter", id);
  if (!access) return c.json(error("NOT_FOUND", "Chapter not found"), 404);
  const deleted = await deleteChapter(access.projectId, id);
  if (!deleted) return c.json(error("NOT_FOUND", "Chapter not found"), 404);
  return c.json(success({ deleted }));
});

// GET /api/studio/projects/:projectId/chapters/youtube — formatted text for YouTube/LinkedIn
chapterRoutes.get("/projects/:projectId/chapters/youtube", async (c) => {
  const projectId = c.req.param("projectId");
  if (!(await viewerCanActOnProject(c.var.userId, projectId))) {
    return c.json(error("NOT_FOUND", "Project not found"), 404);
  }
  return c.json(success(await projectChaptersYoutubeText(projectId)));
});
