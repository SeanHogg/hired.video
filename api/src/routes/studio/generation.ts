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
import { fail, guardGenerationPrompt, ok, studioErrorResponse } from "./http.js";

export const studioGenerationRoutes = new Hono<AppEnv>();

studioGenerationRoutes.post("/generate-comic", async (c) => {
  const user = c.var.user;
  if (!user?.sub) return c.json(fail("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const parsed = GenerateComicSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(fail("VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()), 400);
  }

  const blocked = guardGenerationPrompt(c, parsed.data.prompt, parsed.data.protagonistName);
  if (blocked) return blocked;

  try {
    return c.json(ok(await generateComic(c.env, user, parsed.data)), 201);
  } catch (err) {
    return studioErrorResponse(c, err);
  }
});

studioGenerationRoutes.post("/generate-from-page", async (c) => {
  const user = c.var.user;
  if (!user?.sub) return c.json(fail("UNAUTHORIZED", "Authentication required"), 401);
  // SuperAdmin-only: this turns marketing pages into embeddable promo
  // videos — an operator capability, not an end-user one.
  if (!isSuperAdmin(user)) return c.json(fail("FORBIDDEN", "SuperAdmin access required"), 403);

  const body = await c.req.json().catch(() => null);
  const parsed = HarvestedPageSchema.safeParse(body?.page ?? body);
  if (!parsed.success) {
    return c.json(fail("VALIDATION_ERROR", "Invalid harvested page", parsed.error.flatten()), 400);
  }

  try {
    return c.json(ok(await generatePageVideo(c.env, user, parsed.data)), 201);
  } catch (err) {
    return studioErrorResponse(c, err);
  }
});
