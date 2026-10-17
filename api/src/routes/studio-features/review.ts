/**
 * Studio features — review comments + share links. Mounted at /api/studio through the
 * routes/studio-features.ts barrel (split out of that file; paths unchanged).
 */
import { Hono } from "hono";
import { and, eq, desc } from "drizzle-orm";
import { z } from "zod";
import { UuidLikeSchema } from "../../../../shared/validation.js";
import type { AppEnv } from "../../types/index.js";
import { getDb, schema } from "../../db/index.js";
import { resolveActableEngagementRow } from "../../services/studio/engagement-row-access.js";
import { ok, fail, viewerCanActOnProject, studioReviewComments, studioReviewLinks } from "./shared.js";
import { randomHex } from "../../utils/crypto.js";

export const reviewRoutes = new Hono<AppEnv>();

// ═══════════════════════════════════════════════════════════════════════════════
// ██  17. REVIEW COMMENTS + SHARE LINKS — gap #145
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/studio/projects/:projectId/review-links — create a public review link
reviewRoutes.post("/projects/:projectId/review-links", async (c) => {
  const user = c.var.user;
  const projectId = c.req.param("projectId");
  const body = await c.req.json().catch(() => ({}));
  const parsed = z.object({
    name: z.string().max(80).optional(),
    expiresInDays: z.number().int().positive().max(365).optional(),
  }).safeParse(body);
  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid body"), 400);
  // A share link opens the project's review to outsiders: only someone who
  // may act on the project (owner / company / delegate) may mint one.
  if (!(await viewerCanActOnProject(user?.sub, projectId))) {
    return c.json(fail("NOT_FOUND", "Project not found"), 404);
  }

  const db = getDb();
  const expiresAt = parsed.data.expiresInDays
    ? new Date(Date.now() + parsed.data.expiresInDays * 86400_000)
    : null;

  const [link] = await db.insert(studioReviewLinks).values({
    projectId,
    userId: user.sub,
    shareToken: randomHex(24),
    name: parsed.data.name ?? "Review link",
    expiresAt,
  } as any).returning();

  return c.json(ok(link), 201);
});

// GET /api/studio/projects/:projectId/review-links — owner / company member /
// delegate; every link on the project, whoever minted it.
reviewRoutes.get("/projects/:projectId/review-links", async (c) => {
  const projectId = c.req.param("projectId");
  if (!(await viewerCanActOnProject(c.var.user?.sub, projectId))) {
    return c.json(fail("NOT_FOUND", "Project not found"), 404);
  }
  const db = getDb();
  const links = await db.select().from(studioReviewLinks)
    .where(eq(studioReviewLinks.projectId, projectId))
    .orderBy(desc(studioReviewLinks.createdAt));
  return c.json(ok({ links }));
});

// DELETE /api/studio/review-links/:id — whoever may act on the link's project
reviewRoutes.delete("/review-links/:id", async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  if (!(await resolveActableEngagementRow(user?.sub, "review-link", id))) {
    return c.json(fail("NOT_FOUND", "Link not found"), 404);
  }
  const db = getDb();
  const deleted = await db.delete(studioReviewLinks)
    .where(eq(studioReviewLinks.id, id))
    .returning({ id: studioReviewLinks.id });
  if (deleted.length === 0) return c.json(fail("NOT_FOUND", "Link not found"), 404);
  return c.json(ok({ deleted: deleted[0].id }));
});

// GET /api/studio/review/:shareToken — public — resolves a review link to its
// project + comments. Used by anonymous reviewers.
reviewRoutes.get("/review/:shareToken", async (c) => {
  const token = c.req.param("shareToken");
  const db = getDb();

  const [link] = await db.select().from(studioReviewLinks)
    .where(and(eq(studioReviewLinks.shareToken, token), eq(studioReviewLinks.isActive, true)))
    .limit(1);
  if (!link) return c.json(fail("NOT_FOUND", "Review link not found or inactive"), 404);
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) {
    return c.json(fail("EXPIRED", "Review link has expired"), 410);
  }

  const [project] = await db.select().from(schema.studioProjects)
    .where(eq(schema.studioProjects.id, link.projectId))
    .limit(1);

  const comments = await db.select().from(studioReviewComments)
    .where(eq(studioReviewComments.projectId, link.projectId))
    .orderBy(studioReviewComments.createdAt);

  return c.json(ok({
    projectId: link.projectId,
    project: project ? { id: project.id, status: project.status, videoId: project.videoId } : null,
    comments,
    linkName: link.name,
  }));
});

// GET /api/studio/projects/:projectId/comments — owner / workspace collaborator only (404 otherwise, no existence leak)
reviewRoutes.get("/projects/:projectId/comments", async (c) => {
  const projectId = c.req.param("projectId");
  if (!(await viewerCanActOnProject(c.var.user?.sub, projectId))) {
    return c.json(fail("NOT_FOUND", "Project not found"), 404);
  }
  const db = getDb();
  const comments = await db.select().from(studioReviewComments)
    .where(eq(studioReviewComments.projectId, projectId))
    .orderBy(studioReviewComments.createdAt);
  return c.json(ok({ comments }));
});

// POST /api/studio/projects/:projectId/comments — authenticated post (owner / collaborator)
// Body: { body, timestampSec?, parentId? }
reviewRoutes.post("/projects/:projectId/comments", async (c) => {
  const user = c.var.user;
  const projectId = c.req.param("projectId");
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({
    body: z.string().min(1).max(2000),
    timestampSec: z.number().min(0).nullable().optional(),
    parentId: UuidLikeSchema.nullable().optional(),
  }).safeParse(body);
  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid body"), 400);
  // Signed-in posting is for the project's own team; outside reviewers post
  // through a share link (POST /review/:shareToken/comments below).
  if (!(await viewerCanActOnProject(user?.sub, projectId))) {
    return c.json(fail("NOT_FOUND", "Project not found"), 404);
  }

  const db = getDb();
  const [comment] = await db.insert(studioReviewComments).values({
    projectId,
    parentId: parsed.data.parentId ?? null,
    authorUserId: user.sub,
    authorName: user.email?.split("@")[0] ?? "Reviewer",
    authorEmail: user.email,
    body: parsed.data.body,
    timestampSec: parsed.data.timestampSec ?? null,
  }).returning();

  return c.json(ok(comment), 201);
});

// POST /api/studio/review/:shareToken/comments — public anonymous post
reviewRoutes.post("/review/:shareToken/comments", async (c) => {
  const token = c.req.param("shareToken");
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({
    authorName: z.string().min(1).max(80),
    authorEmail: z.string().email().optional(),
    body: z.string().min(1).max(2000),
    timestampSec: z.number().min(0).nullable().optional(),
    parentId: UuidLikeSchema.nullable().optional(),
  }).safeParse(body);
  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid body"), 400);

  const db = getDb();
  const [link] = await db.select().from(studioReviewLinks)
    .where(and(eq(studioReviewLinks.shareToken, token), eq(studioReviewLinks.isActive, true)))
    .limit(1);
  if (!link) return c.json(fail("NOT_FOUND", "Review link not found"), 404);
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) {
    return c.json(fail("EXPIRED", "Review link has expired"), 410);
  }

  const [comment] = await db.insert(studioReviewComments).values({
    projectId: link.projectId,
    parentId: parsed.data.parentId ?? null,
    authorUserId: null,
    authorName: parsed.data.authorName,
    authorEmail: parsed.data.authorEmail ?? null,
    body: parsed.data.body,
    timestampSec: parsed.data.timestampSec ?? null,
  } as any).returning();

  return c.json(ok(comment), 201);
});

// PATCH /api/studio/comments/:id — resolve / unresolve
reviewRoutes.patch("/comments/:id", async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({ resolved: z.boolean() }).safeParse(body);
  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid body"), 400);

  // Caller must be able to act on the comment's project (owner / company /
  // delegate); unknown and forbidden comments both answer 404.
  if (!(await resolveActableEngagementRow(user?.sub, "comment", id))) {
    return c.json(fail("NOT_FOUND", "Comment not found"), 404);
  }

  const db = getDb();
  const [updated] = await db.update(studioReviewComments)
    .set({ resolved: parsed.data.resolved } as any)
    .where(eq(studioReviewComments.id, id))
    .returning();
  return c.json(ok(updated));
});

// DELETE /api/studio/comments/:id — project owner / company member / delegate
reviewRoutes.delete("/comments/:id", async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  if (!(await resolveActableEngagementRow(user?.sub, "comment", id))) {
    return c.json(fail("NOT_FOUND", "Comment not found"), 404);
  }
  const db = getDb();

  await db.delete(studioReviewComments).where(eq(studioReviewComments.id, id));
  return c.json(ok({ deleted: id }));
});
