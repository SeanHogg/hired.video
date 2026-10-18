/**
 * /api/photoreal-avatar — provider-agnostic photorealistic talking-head
 * render seam (#1560). The provider dispatch and render use cases live in
 * services/studio/photoreal-avatar.ts.
 *
 *   POST /renders         queue a render
 *   GET  /renders/:id     poll status
 *   GET  /renders         list caller's renders (newest first)
 */

import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import {
  getPhotorealAvatarRender,
  listPhotorealAvatarRenders,
  queuePhotorealAvatarRender,
} from "../services/studio/photoreal-avatar.js";
import { requireUser } from "./helpers/routerHelpers.js";
import { validateJson } from "./helpers/validate.js";

export const photorealAvatarRoutes = new Hono<AppEnv>();

const QueueSchema = z.object({
  portraitMediaId: z.string().uuid().optional(),
  voiceCloneId: z.string().uuid().optional(),
  scriptText: z.string().max(20_000).optional(),
  audioUrl: z.string().url().optional(),
});

photorealAvatarRoutes.post("/renders", validateJson(QueueSchema, (e) => error("VALIDATION_ERROR", "Invalid render payload", e.flatten())), async (c) => {
  const row = await queuePhotorealAvatarRender(requireUser(c), c.req.valid("json"));
  return c.json(success({ render: row }), 201);
});

photorealAvatarRoutes.get("/renders", async (c) => {
  const rows = await listPhotorealAvatarRenders(requireUser(c));
  return c.json(success({ items: rows }), 200);
});

photorealAvatarRoutes.get("/renders/:id", async (c) => {
  const row = await getPhotorealAvatarRender(requireUser(c), c.req.param("id"));
  return c.json(success({ render: row }), 200);
});
