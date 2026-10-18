/**
 * Studio LLM scaffolders (W2-3a split of routes/studio.ts):
 *   POST /generate-comic      — prompt + source artefact → ComicSpec
 *                               (useGenerateComic is the single consumer)
 *   POST /generate-from-page  — SuperAdmin: harvested marketing page →
 *                               PageVideoSpec (#1860)
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { isSuperAdmin } from "../../middleware/superAdmin.js";
import { GenerateComicSchema, generateComic } from "../../services/studio/comic-generation.js";
import { HarvestedPageSchema, generatePageVideo } from "../../services/studio/page-video-generation.js";
import { guardGenerationPrompt } from "./http.js";
import { success, error } from "../../types/index.js";
import { requireUser } from "../helpers/routerHelpers.js";
import { validateJson } from "../helpers/validate.js";

export const studioGenerationRoutes = new Hono<AppEnv>();

studioGenerationRoutes.post("/generate-comic", validateJson(GenerateComicSchema, (e) => error("VALIDATION_ERROR", "Invalid request body", e.flatten()), { emptyBody: null }), async (c) => {
  const user = c.var.user;
  requireUser(c);

  const body = c.req.valid("json");

  const blocked = guardGenerationPrompt(c, body.prompt, body.protagonistName);
  if (blocked) return blocked;

  return c.json(success(await generateComic(c.env, user, body)), 201);
});

studioGenerationRoutes.post("/generate-from-page", async (c) => {
  const user = c.var.user;
  requireUser(c);
  // SuperAdmin-only: this turns marketing pages into embeddable promo
  // videos — an operator capability, not an end-user one.
  if (!isSuperAdmin(user)) return c.json(error("FORBIDDEN", "SuperAdmin access required"), 403);

  const body = await c.req.json().catch(() => null);
  const parsed = HarvestedPageSchema.safeParse(body?.page ?? body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid harvested page", parsed.error.flatten()), 400);
  }

  return c.json(success(await generatePageVideo(c.env, user, parsed.data)), 201);
});
