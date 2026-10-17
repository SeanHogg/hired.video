/**
 * Public course reads — registered before the owner `/:id` handlers so
 * `/api/courses/public` is never captured as id="public":
 *   GET /api/courses/public                         — published feed
 *   GET /api/courses/public/by-user/:userId         — one author's courses
 *   GET /api/courses/public/:userIdOrSlug/:slug     — public detail
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { success } from "../../types/index.js";
import { clampLimit } from "../../utils/pagination.js";
import {
  getPublicCourseDetail,
  listPublicCourses,
  listPublicCoursesByAuthor,
} from "../../services/courses/coursePublicService.js";
import { respond } from "./shared.js";

export const coursePublicRoutes = new Hono<AppEnv>();

coursePublicRoutes.get("/public", async (c) => {
  const limit = clampLimit(c.req.query("limit"), 20, 100);
  return c.json(success(await listPublicCourses(limit)), 200);
});

// Static `/public/by-user/:userId` before `/public/:userIdOrSlug/:slug`.
coursePublicRoutes.get("/public/by-user/:userId", async (c) => {
  const limit = clampLimit(c.req.query("limit"), 50, 100);
  return c.json(success(await listPublicCoursesByAuthor(c.req.param("userId"), limit)), 200);
});

coursePublicRoutes.get("/public/:userIdOrSlug/:slug", (c) =>
  respond(c, () => getPublicCourseDetail(c.req.param("userIdOrSlug"), c.req.param("slug"))),
);
