/**
 * Studio features — review comments + share links. Mounted at /api/studio through the
 * routes/studio-features.ts barrel (split out of that file; paths unchanged).
 */
import { Hono } from "hono";
import { z } from "zod";
import { UuidLikeSchema } from "../../../../shared/validation.js";
import type { AppEnv } from "../../types/index.js";
import { resolveActableEngagementRow } from "../../services/studio/engagement-row-access.js";
import { viewerCanActOnProject } from "./shared.js";
import {
  addProjectReviewComment,
  addPublicReviewComment,
  deleteReviewComment,
  getPublicReview,
  listProjectReviewComments,
  setReviewCommentResolved,
} from "../../services/studio/project-review.js";
import {
  deleteStudioReviewLink,
  insertStudioReviewLink,
  listStudioReviewLinks,
} from "../../repositories/studioReviewLinksRepository.js";
import { randomHex } from "../../utils/crypto.js";
import { success, error } from "../../types/index.js";
import { validateJson } from "../helpers/validate.js";

export const reviewRoutes = new Hono<AppEnv>();

// ═══════════════════════════════════════════════════════════════════════════════
// ██  17. REVIEW COMMENTS + SHARE LINKS — gap #145
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/studio/projects/:projectId/review-links — create a public review link
reviewRoutes.post("/projects/:projectId/review-links", validateJson(z.object({
    name: z.string().max(80).optional(),
    expiresInDays: z.number().int().positive().max(365).optional(),
  }), () => error("VALIDATION_ERROR", "Invalid body")), async (c) => {
  const user = c.var.user;
  const projectId = c.req.param("projectId");
  const body = c.req.valid("json");
  // A share link opens the project's review to outsiders: only someone who
  // may act on the project (owner / company / delegate) may mint one.
  if (!(await viewerCanActOnProject(user?.sub, projectId))) {
    return c.json(error("NOT_FOUND", "Project not found"), 404);
  }

  const expiresAt = body.expiresInDays
    ? new Date(Date.now() + body.expiresInDays * 86400_000)
    : null;

  const link = await insertStudioReviewLink({
    projectId,
    userId: user.sub,
    shareToken: randomHex(24),
    name: body.name ?? "Review link",
    expiresAt,
  });

  return c.json(success(link), 201);
});

// GET /api/studio/projects/:projectId/review-links — owner / company member /
// delegate; every link on the project, whoever minted it.
reviewRoutes.get("/projects/:projectId/review-links", async (c) => {
  const projectId = c.req.param("projectId");
  if (!(await viewerCanActOnProject(c.var.userId, projectId))) {
    return c.json(error("NOT_FOUND", "Project not found"), 404);
  }
  const links = await listStudioReviewLinks(projectId);
  return c.json(success({ links }));
});

// DELETE /api/studio/review-links/:id — whoever may act on the link's project
reviewRoutes.delete("/review-links/:id", async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  if (!(await resolveActableEngagementRow(user?.sub, "review-link", id))) {
    return c.json(error("NOT_FOUND", "Link not found"), 404);
  }
  const deletedId = await deleteStudioReviewLink(id);
  if (!deletedId) return c.json(error("NOT_FOUND", "Link not found"), 404);
  return c.json(success({ deleted: deletedId }));
});

// GET /api/studio/review/:shareToken — public — resolves a review link to its
// project + comments. Used by anonymous reviewers.
reviewRoutes.get("/review/:shareToken", async (c) => {
  return c.json(success(await getPublicReview(c.req.param("shareToken"))));
});

// GET /api/studio/projects/:projectId/comments — owner / workspace collaborator only (404 otherwise, no existence leak)
reviewRoutes.get("/projects/:projectId/comments", async (c) => {
  const projectId = c.req.param("projectId");
  if (!(await viewerCanActOnProject(c.var.userId, projectId))) {
    return c.json(error("NOT_FOUND", "Project not found"), 404);
  }
  const comments = await listProjectReviewComments(projectId);
  return c.json(success({ comments }));
});

// POST /api/studio/projects/:projectId/comments — authenticated post (owner / collaborator)
// Body: { body, timestampSec?, parentId? }
reviewRoutes.post("/projects/:projectId/comments", validateJson(z.object({
    body: z.string().min(1).max(2000),
    timestampSec: z.number().min(0).nullable().optional(),
    parentId: UuidLikeSchema.nullable().optional(),
  }), () => error("VALIDATION_ERROR", "Invalid body"), { emptyBody: null }), async (c) => {
  const user = c.var.user;
  const projectId = c.req.param("projectId");
  const body = c.req.valid("json");
  // Signed-in posting is for the project's own team; outside reviewers post
  // through a share link (POST /review/:shareToken/comments below).
  if (!(await viewerCanActOnProject(user?.sub, projectId))) {
    return c.json(error("NOT_FOUND", "Project not found"), 404);
  }

  const comment = await addProjectReviewComment({
    projectId,
    parentId: body.parentId ?? null,
    authorUserId: user.sub,
    authorName: user.email?.split("@")[0] ?? "Reviewer",
    authorEmail: user.email ?? null,
    body: body.body,
    timestampSec: body.timestampSec ?? null,
  });

  return c.json(success(comment), 201);
});

// POST /api/studio/review/:shareToken/comments — public anonymous post
reviewRoutes.post("/review/:shareToken/comments", validateJson(z.object({
    authorName: z.string().min(1).max(80),
    authorEmail: z.string().email().optional(),
    body: z.string().min(1).max(2000),
    timestampSec: z.number().min(0).nullable().optional(),
    parentId: UuidLikeSchema.nullable().optional(),
  }), () => error("VALIDATION_ERROR", "Invalid body"), { emptyBody: null }), async (c) => {
  const body = c.req.valid("json");
  const comment = await addPublicReviewComment(c.req.param("shareToken"), {
    parentId: body.parentId ?? null,
    authorName: body.authorName,
    authorEmail: body.authorEmail ?? null,
    body: body.body,
    timestampSec: body.timestampSec ?? null,
  });

  return c.json(success(comment), 201);
});

// PATCH /api/studio/comments/:id — resolve / unresolve
reviewRoutes.patch("/comments/:id", validateJson(z.object({ resolved: z.boolean() }), () => error("VALIDATION_ERROR", "Invalid body"), { emptyBody: null }), async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  const body = c.req.valid("json");

  // Caller must be able to act on the comment's project (owner / company /
  // delegate); unknown and forbidden comments both answer 404.
  if (!(await resolveActableEngagementRow(user?.sub, "comment", id))) {
    return c.json(error("NOT_FOUND", "Comment not found"), 404);
  }

  const updated = await setReviewCommentResolved(id, body.resolved);
  return c.json(success(updated));
});

// DELETE /api/studio/comments/:id — project owner / company member / delegate
reviewRoutes.delete("/comments/:id", async (c) => {
  const user = c.var.user;
  const id = c.req.param("id");
  if (!(await resolveActableEngagementRow(user?.sub, "comment", id))) {
    return c.json(error("NOT_FOUND", "Comment not found"), 404);
  }
  await deleteReviewComment(id);
  return c.json(success({ deleted: id }));
});
