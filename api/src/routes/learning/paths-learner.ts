/**
 * Learning paths — published feed + learner endpoints (see
 * paths-authoring.ts for the owner side). Mounted under /api/learning at "/"
 * BEFORE the authoring router so the static `/paths/public` and
 * `/paths/me/enrollments` segments win over `/paths/:id`.
 *
 *   GET  /paths/public                 — published feed
 *   GET  /paths/public/:id             — published path + courses
 *   GET  /paths/me/enrollments         — my path enrollments
 *   POST /paths/:id/enroll
 *   GET  /paths/:id/progress           — unlock state + per-course pass
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import { clampLimit } from "../../utils/pagination.js";
import {
  enrollInPath,
  getPathProgress,
  getPublicPath,
  listMyPathEnrollments,
  listPublicPaths,
} from "../../services/learning/learning-path-use-cases.js";
import { requireUser } from "../helpers/routerHelpers.js";

export const pathLearnerRoutes = new Hono<AppEnv>();

pathLearnerRoutes.get("/paths/public", async (c) => {
  const limit = clampLimit(c.req.query("limit"), 20, 100);
  return c.json(success(await listPublicPaths(limit)), 200);
});

pathLearnerRoutes.get("/paths/public/:id", async (c) => {
  const detail = await getPublicPath(c.req.param("id"));
  if (!detail) return c.json(error("NOT_FOUND", "Path not found"), 404);
  return c.json(success(detail), 200);
});

pathLearnerRoutes.get("/paths/me/enrollments", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await listMyPathEnrollments(userId)), 200);
});

pathLearnerRoutes.post("/paths/:id/enroll", async (c) => {
  const userId = requireUser(c);
  const result = await enrollInPath(userId, c.req.param("id"));
  if (!result) return c.json(error("NOT_FOUND", "Path not found"), 404);
  return c.json(success(result.enrollment), result.created ? 201 : 200);
});

pathLearnerRoutes.get("/paths/:id/progress", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await getPathProgress(userId, c.req.param("id"))), 200);
});
