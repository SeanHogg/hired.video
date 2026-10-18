/**
 * /api/studio/projects/:id/home-wall (gap #2354) — whether a project's public
 * video shows on the hired.video home page and in discovery.
 *
 *   GET   — { showOnHome }
 *   PATCH — { showOnHome } → saves it (owner / workspace writer only)
 */
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { UuidLikeSchema } from "../../../shared/validation.js";
import { getShowOnHome, setShowOnHome } from "../services/studio/home-wall.js";
import { scheduleVideoScan } from "../services/moderation/explicit/schedule.js";
import { validateJson } from "./helpers/validate.js";

export const studioHomeWallRoutes = new Hono<AppEnv>();

const BodySchema = z.object({ showOnHome: z.boolean() }).strict();

studioHomeWallRoutes.get("/projects/:id/home-wall", async (c) => {
  if (!UuidLikeSchema.safeParse(c.req.param("id")).success) return c.json(error("NOT_FOUND", "Project not found"), 404);
  return c.json(success({ showOnHome: await getShowOnHome(c.var.userId, c.req.param("id")) }));
});

studioHomeWallRoutes.patch("/projects/:id/home-wall", validateJson(BodySchema, () => error("VALIDATION_ERROR", "showOnHome must be true or false"), { emptyBody: null }), async (c) => {
  if (!UuidLikeSchema.safeParse(c.req.param("id")).success) return c.json(error("NOT_FOUND", "Project not found"), 404);
  const body = c.req.valid("json");
  const { showOnHome, videoId } = await setShowOnHome(c.var.userId, c.req.param("id"), body.showOnHome);
  // Back on the wall → it must pass the explicit scan first (no-op when
  // the video's content is unchanged since its last verdict).
  if (showOnHome) scheduleVideoScan(c, videoId);
  return c.json(success({ showOnHome }));
});
