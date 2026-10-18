/**
 * POST /api/studio/images — the ONE AI image port (W2-3a; replaces the
 * retired /generate-image, /inpaint-image and /outpaint-image routes).
 * Body: `{ mode: "generate" | "inpaint" | "outpaint", prompt, ...mode fields }`
 *   generate: sourceImageUrl? | sourceImageDataUrl?, strength?  → { imageUrl, mode: "text2img"|"img2img" }
 *   inpaint:  sourceImageDataUrl, maskImageDataUrl, strength?   → { imageUrl, mode: "inpaint" }
 *   outpaint: sourceImageDataUrl, expandTop/Right/Bottom/Left, strength?
 *                                                               → { imageUrl, mode: "outpaint", expand }
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { parseAiImageRequest, runAiImageRequest } from "../../services/studio/ai-images.js";
import { guardGenerationPrompt } from "./http.js";
import { success } from "../../types/index.js";
import { requireUser } from "../helpers/routerHelpers.js";

export const studioImageRoutes = new Hono<AppEnv>();

studioImageRoutes.post("/images", async (c) => {
  const user = c.var.user;
  requireUser(c);

  const body: unknown = await c.req.json().catch(() => null);
  const request = parseAiImageRequest(body && typeof body === "object" ? (body as Record<string, unknown>) : null);
  const blocked = guardGenerationPrompt(c, request.prompt);
  if (blocked) return blocked;
  return c.json(success(await runAiImageRequest(c.env, user, request)));
});
