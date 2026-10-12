/**
 * /api/studio/projects/:id/home-wall (gap #2354) — whether a project's public
 * video shows on the hired.video home page and in discovery.
 *
 *   GET   — { showOnHome }
 *   PATCH — { showOnHome } → saves it (owner / workspace writer only)
 */
import { Hono, type Context } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { UuidLikeSchema } from "../../../shared/validation.js";
import { WorkspaceForbiddenError } from "../services/studio/workspace.js";
import { HomeWallError, getShowOnHome, setShowOnHome } from "../services/studio/home-wall.js";
import { scheduleVideoScan } from "../services/moderation/explicit/schedule.js";

export const studioHomeWallRoutes = new Hono<AppEnv>();

const BodySchema = z.object({ showOnHome: z.boolean() }).strict();

function fail(c: Context, err: unknown): Response {
  if (err instanceof HomeWallError) return c.json(error(err.code, err.message), err.code === "NOT_FOUND" ? 404 : 409);
  if (err instanceof WorkspaceForbiddenError) return c.json(error("FORBIDDEN", err.message), 403);
  throw err;
}

studioHomeWallRoutes.get("/projects/:id/home-wall", async (c) => {
  if (!UuidLikeSchema.safeParse(c.req.param("id")).success) return c.json(error("NOT_FOUND", "Project not found"), 404);
  try {
    return c.json(success({ showOnHome: await getShowOnHome(c.var.user.sub, c.req.param("id")) }));
  } catch (err) {
    return fail(c, err);
  }
});

studioHomeWallRoutes.patch("/projects/:id/home-wall", async (c) => {
  if (!UuidLikeSchema.safeParse(c.req.param("id")).success) return c.json(error("NOT_FOUND", "Project not found"), 404);
  const parsed = BodySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "showOnHome must be true or false"), 400);
  try {
    const { showOnHome, videoId } = await setShowOnHome(c.var.user.sub, c.req.param("id"), parsed.data.showOnHome);
    // Back on the wall → it must pass the explicit scan first (no-op when
    // the video's content is unchanged since its last verdict).
    if (showOnHome) scheduleVideoScan(c, videoId);
    return c.json(success({ showOnHome }));
  } catch (err) {
    return fail(c, err);
  }
});
