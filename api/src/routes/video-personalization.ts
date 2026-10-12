/**
 * /api/video-personalization — Settings › Video personalization
 * (migration 0503, gap #2350). The signed-in person's own data only.
 *
 *   GET /   — their personalization (defaults when unset)
 *   PUT /   — save it (a silent guest account is asked to sign up first)
 */
import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { VideoPersonalizationSchema } from "../../../shared/video-personalization.js";
import { getVideoPersonalization, saveVideoPersonalization } from "../services/video-personalization/videoPersonalization.js";
import { guardPublicText } from "../services/moderation/explicit/textGates.js";

export const videoPersonalizationRoutes = new Hono<AppEnv>();

videoPersonalizationRoutes.get("/", async (c) => c.json(success(await getVideoPersonalization(c.var.user.sub))));

videoPersonalizationRoutes.put("/", async (c) => {
  if (c.var.user.guest) return c.json(error("ACCOUNT_REQUIRED", "Create a free account to save this"), 403);
  const parsed = VideoPersonalizationSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid personalization"), 400);
  }
  // The "own words" sentence and typed-in interests are woven into videos
  // that can reach the home wall — explicit text is rejected (throws 422
  // EXPLICIT_CONTENT).
  await guardPublicText(
    { subject: "video_personalization", userId: c.var.user.sub, text: [parsed.data.ownWords, ...parsed.data.interests].join("\n") },
    c.env,
  );
  return c.json(success(await saveVideoPersonalization(c.var.user.sub, parsed.data)));
});
