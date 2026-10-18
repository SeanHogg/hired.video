/**
 * Public video rails + embed (no auth required; optional viewer).
 *   GET /api/studio/videos/user/:userId     — profile rail (owned + credited)
 *   GET /api/studio/videos/resume/:resumeId — résumé rail
 *   GET /api/studio/videos/featured         — home-page hero carousel
 *   GET /api/studio/videos/:videoId/embed   — iframe embed snippet
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import {
  buildVideoEmbed,
  listFeaturedVideos,
  listResumeRail,
  listUserRail,
} from "../../services/studio/video-catalog.js";
import { success } from "../../types/index.js";

export const studioVideoRoutes = new Hono<AppEnv>();

studioVideoRoutes.get("/videos/user/:userId", async (c) => {
  return c.json(success(await listUserRail(c.req.param("userId"), c.var.userId)));
});

studioVideoRoutes.get("/videos/resume/:resumeId", async (c) => {
  return c.json(success(await listResumeRail(c.req.param("resumeId"), c.var.userId)));
});

studioVideoRoutes.get("/videos/featured", async (c) => {
  return c.json(success(await listFeaturedVideos()));
});

studioVideoRoutes.get("/videos/:videoId/embed", async (c) => {
  const width = Number(c.req.query("width") ?? 640);
  const height = Number(c.req.query("height") ?? 360);
  return c.json(success(await buildVideoEmbed(c.req.param("videoId"), width, height)));
});
