/**
 * SuperAdmin studio moderation — mounted at /api/admin/studio by the admin
 * composite (routes/admin/index.ts), which applies the SA guard.
 *
 *   GET    /projects                      — every project + owner videos + orphans
 *   DELETE /projects/:projectId           — delete any project (and its media)
 *   DELETE /videos/:videoId               — delete any video record
 *   PATCH  /projects/:projectId/featured  — homepage pin { isFeatured }
 */
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../types/index.js";
import { AdminStudioService } from "../../services/admin/AdminStudioService.js";
import { success, error } from "../../types/index.js";
import { validateJson } from "../helpers/validate.js";

const StudioSearchSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().optional(),
  status: z.string().optional(),
  purpose: z.string().optional(),
});

const FeaturedBodySchema = z.object({ isFeatured: z.boolean() });

const projectNotFound = { error: { code: "NOT_FOUND", message: "Project not found" } };

export const adminStudioModerationRoutes = new Hono<AppEnv>();

adminStudioModerationRoutes.get("/projects", async (c) => {
  const query = StudioSearchSchema.safeParse(c.req.query());
  if (!query.success) return c.json(error("BAD_REQUEST", query.error.issues[0].message), 400);
  return c.json(success(await AdminStudioService.create().listProjects(query.data)), 200);
});

adminStudioModerationRoutes.delete("/projects/:projectId", async (c) => {
  const projectId = c.req.param("projectId");
  if (!(await AdminStudioService.create().deleteProject(projectId))) return c.json(projectNotFound, 404);
  return c.json(success({ id: projectId }), 200);
});

adminStudioModerationRoutes.delete("/videos/:videoId", async (c) => {
  const videoId = c.req.param("videoId");
  if (!(await AdminStudioService.create().deleteVideo(videoId))) {
    return c.json(error("NOT_FOUND", "Video not found"), 404);
  }
  return c.json(success({ id: videoId }), 200);
});

adminStudioModerationRoutes.patch("/projects/:projectId/featured", validateJson(FeaturedBodySchema, () => error("BAD_REQUEST", "isFeatured must be boolean"), { emptyBody: null }), async (c) => {
  const projectId = c.req.param("projectId");
  const body = c.req.valid("json");
  const result = await AdminStudioService.create().setFeatured(projectId, body.isFeatured);
  if (result.kind === "not_found") return c.json(projectNotFound, 404);
  if (result.kind === "not_public") {
    return c.json(error("NOT_PUBLIC", "Project must be public to feature on homepage"), 400);
  }
  return c.json(success({ id: projectId, isFeatured: "isFeatured" in result ? result.isFeatured : body.isFeatured }), 200);
});
