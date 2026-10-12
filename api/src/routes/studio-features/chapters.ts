/**
 * Studio features — video chapters + TOC. Mounted at /api/studio through the
 * routes/studio-features.ts barrel (split out of that file; paths unchanged).
 */
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { AppEnv } from "../../types/index.js";
import { getDb } from "../../db/index.js";
import { invalidatePublicEngagement } from "../../services/studio/public-engagement.js";
import { resolveActableEngagementRow } from "../../services/studio/engagement-row-access.js";
import { ok, fail, viewerCanActOnProject, studioChapters } from "./shared.js";

export const chapterRoutes = new Hono<AppEnv>();

// ═══════════════════════════════════════════════════════════════════════════════
// ██  14. VIDEO CHAPTERS + TOC — gap #141
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/studio/projects/:projectId/chapters
chapterRoutes.get("/projects/:projectId/chapters", async (c) => {
  const projectId = c.req.param("projectId");
  if (!(await viewerCanActOnProject(c.var.user?.sub, projectId))) {
    return c.json(fail("NOT_FOUND", "Project not found"), 404);
  }
  const db = getDb();

  const chapters = await db
    .select()
    .from(studioChapters)
    .where(eq(studioChapters.projectId, projectId))
    .orderBy(studioChapters.startSeconds);

  return c.json(ok({ chapters }));
});

// POST /api/studio/projects/:projectId/chapters — create or replace full chapter list
// Body: { chapters: Array<{ title, startSeconds, thumbnailUrl? }> }
chapterRoutes.post("/projects/:projectId/chapters", async (c) => {
  const user = c.var.user;
  const projectId = c.req.param("projectId");
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({
    chapters: z.array(z.object({
      title:        z.string().min(1).max(120),
      startSeconds: z.number().min(0),
      thumbnailUrl: z.string().url().optional(),
    })).max(200),
    replace: z.boolean().default(true),
  }).safeParse(body);

  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid body", parsed.error.flatten()), 400);
  // Chapters feed the PUBLIC engagement read — only someone who may act on
  // the project may write them (unknown / forbidden → 404, no leak).
  if (!(await viewerCanActOnProject(user.sub, projectId))) {
    return c.json(fail("NOT_FOUND", "Project not found"), 404);
  }

  const db = getDb();

  if (parsed.data.replace) {
    // Replace the project's whole list: the caller may act on the project
    // (checked above), whoever created the existing rows.
    await db.delete(studioChapters).where(eq(studioChapters.projectId, projectId));
  }

  // Sort by startSeconds, assign orderIndex
  const sorted = [...parsed.data.chapters].sort((a, b) => a.startSeconds - b.startSeconds);
  if (sorted.length === 0) {
    invalidatePublicEngagement(projectId);
    return c.json(ok({ chapters: [] }));
  }

  const inserted = await db.insert(studioChapters).values(
    sorted.map((ch, i) => ({
      projectId,
      userId: user.sub,
      title: ch.title,
      startSeconds: ch.startSeconds,
      thumbnailUrl: ch.thumbnailUrl ?? null,
      orderIndex: i,
    }) as any),
  ).returning();

  invalidatePublicEngagement(projectId);
  return c.json(ok({ chapters: inserted }), 201);
});

// PATCH /api/studio/chapters/:id — edit a single chapter
chapterRoutes.patch("/chapters/:id", async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({
    title:        z.string().min(1).max(120).optional(),
    startSeconds: z.number().min(0).optional(),
    thumbnailUrl: z.string().url().nullable().optional(),
  }).safeParse(body);
  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid body"), 400);
  // Authorised through the row's project (owner / company / delegate).
  const access = await resolveActableEngagementRow(user.sub, "chapter", id);
  if (!access) return c.json(fail("NOT_FOUND", "Chapter not found"), 404);

  const db = getDb();
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.title !== undefined) patch.title = parsed.data.title;
  if (parsed.data.startSeconds !== undefined) patch.startSeconds = parsed.data.startSeconds;
  if (parsed.data.thumbnailUrl !== undefined) patch.thumbnailUrl = parsed.data.thumbnailUrl;

  const [updated] = await db.update(studioChapters)
    .set(patch as any)
    .where(eq(studioChapters.id, id))
    .returning();

  if (!updated) return c.json(fail("NOT_FOUND", "Chapter not found"), 404);
  invalidatePublicEngagement(access.projectId);
  return c.json(ok(updated));
});

// DELETE /api/studio/chapters/:id
chapterRoutes.delete("/chapters/:id", async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  const access = await resolveActableEngagementRow(user.sub, "chapter", id);
  if (!access) return c.json(fail("NOT_FOUND", "Chapter not found"), 404);
  const db = getDb();
  const deleted = await db.delete(studioChapters)
    .where(eq(studioChapters.id, id))
    .returning({ id: studioChapters.id });
  if (deleted.length === 0) return c.json(fail("NOT_FOUND", "Chapter not found"), 404);
  invalidatePublicEngagement(access.projectId);
  return c.json(ok({ deleted: deleted[0].id }));
});

// GET /api/studio/projects/:projectId/chapters/youtube — formatted text for YouTube/LinkedIn
chapterRoutes.get("/projects/:projectId/chapters/youtube", async (c) => {
  const projectId = c.req.param("projectId");
  if (!(await viewerCanActOnProject(c.var.user?.sub, projectId))) {
    return c.json(fail("NOT_FOUND", "Project not found"), 404);
  }
  const db = getDb();
  const chapters = await db
    .select()
    .from(studioChapters)
    .where(eq(studioChapters.projectId, projectId))
    .orderBy(studioChapters.startSeconds);

  const lines = chapters.map((ch) => {
    const total = Math.floor(ch.startSeconds);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const ts = h > 0
      ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      : `${m}:${String(s).padStart(2, "0")}`;
    return `${ts} ${ch.title}`;
  });

  return c.json(ok({ text: lines.join("\n"), count: chapters.length }));
});
