/**
 * Studio features — social caption AI. Mounted at /api/studio through the
 * routes/studio-features.ts barrel (split out of that file; paths unchanged).
 */
import { Hono } from "hono";
import { z } from "zod";
import { UuidLikeSchema } from "../../../../shared/validation.js";
import type { AppEnv } from "../../types/index.js";
import { aiFailure } from "../../services/adapters/llm-error.js";
import { checkTokenBudget } from "../../middleware/tierEnforcement.js";
import { createAiTextCaller, hasAiTextProvider } from "../../services/adapters/ai-text-caller.js";
import { CAPTION_TONES, generateProjectSocialCaption } from "../../../../shared/social-caption.js";
import { loadOwnedCaptionSource } from "../../services/studio/social-caption.js";
import { VIDEO_PUBLISH_PLATFORMS } from "../../../../shared/social-platforms.js";
import { success } from "../../types/index.js";
import { validateJson } from "../helpers/validate.js";

export const socialCaptionRoutes = new Hono<AppEnv>();

// ═══════════════════════════════════════════════════════════════════════════════
// ██  3. SOCIAL CAPTION AI
// ═══════════════════════════════════════════════════════════════════════════════

// Posting goes through the ONE social publish path
// (POST /api/studio/projects/:id/publish/social/:platform — services/social).

// POST /api/studio/social/generate-caption — AI hook + caption + hashtags from
// what the project's video says (#203), sized for the networks the post goes
// to (#2045: the tightest of their text limits). Use case:
// shared/social-caption (generateProjectSocialCaption).
const SocialCaptionSchema = z.object({
  projectId: UuidLikeSchema,
  tone: z.enum(CAPTION_TONES).default("professional"),
  platforms: z.array(z.enum(VIDEO_PUBLISH_PLATFORMS)).max(VIDEO_PUBLISH_PLATFORMS.length).default(["linkedin"]),
});

// Free for every plan (the Post dock's "Write it for me"); metered by the
// monthly AI token budget like the other free AI helpers.
socialCaptionRoutes.post("/social/generate-caption", validateJson(SocialCaptionSchema, undefined, { emptyBody: null }), async (c) => {
  const user = c.var.user;
  const overBudget = await checkTokenBudget(c);
  if (overBudget) return overBudget;
  const body = c.req.valid("json");

  // The caption reads the Timeline under its per-kind name (state → timelineSpec).
  const source = await loadOwnedCaptionSource(user.sub, body.projectId);

  // Gateway first, Workers AI fallback — a revoked gateway key degrades
  // instead of taking the caption down (#2309).
  const callAI = hasAiTextProvider(c.env)
    ? createAiTextCaller(c.env, user, { label: "linkedin_post_gen", useCase: "linkedin_post" })
    : null;
  try {
    return c.json(success(await generateProjectSocialCaption(source, { tone: body.tone, platforms: body.platforms }, callAI)));
  } catch (err) {
    // A model answered but not with a usable post: a typed AI_* envelope,
    // never the heuristic post dressed up as the AI's.
    return aiFailure(c, err, "[social/generate-caption] LLM error");
  }
});
