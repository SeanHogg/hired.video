/**
 * Studio features — social caption AI. Mounted at /api/studio through the
 * routes/studio-features.ts barrel (split out of that file; paths unchanged).
 */
import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { UuidLikeSchema } from "../../../../shared/validation.js";
import type { AppEnv } from "../../types/index.js";
import { getDb, schema } from "../../db/index.js";
import { aiFailure } from "../../services/adapters/llm-error.js";
import { checkTokenBudget } from "../../middleware/tierEnforcement.js";
import { createAiTextCaller, hasAiTextProvider } from "../../services/adapters/ai-text-caller.js";
import { CAPTION_TONES, generateSocialCaption } from "../../services/studio/social-caption.js";
import { VIDEO_PUBLISH_PLATFORMS } from "../../../../shared/social-platforms.js";
import { ok, fail } from "./shared.js";

export const socialCaptionRoutes = new Hono<AppEnv>();

// ═══════════════════════════════════════════════════════════════════════════════
// ██  3. SOCIAL CAPTION AI
// ═══════════════════════════════════════════════════════════════════════════════

// Posting goes through the ONE social publish path
// (POST /api/studio/projects/:id/publish/social/:platform — services/social).

// POST /api/studio/social/generate-caption — AI hook + caption + hashtags from
// what the project's video says (#203), sized for the networks the post goes
// to (#2045: the tightest of their text limits). Use case:
// services/studio/social-caption.
const SocialCaptionSchema = z.object({
  projectId: UuidLikeSchema,
  tone: z.enum(CAPTION_TONES).default("professional"),
  platforms: z.array(z.enum(VIDEO_PUBLISH_PLATFORMS)).max(VIDEO_PUBLISH_PLATFORMS.length).default(["linkedin"]),
});

// Free for every plan (the Post dock's "Write it for me"); metered by the
// monthly AI token budget like the other free AI helpers.
socialCaptionRoutes.post("/social/generate-caption", async (c) => {
  const user = c.var.user;
  const overBudget = await checkTokenBudget(c);
  if (overBudget) return overBudget;
  const body = await c.req.json().catch(() => null);
  const parsed = SocialCaptionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(fail("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);
  }

  const db = getDb();
  const [project] = await db
    .select()
    .from(schema.studioProjects)
    .where(and(
      eq(schema.studioProjects.id, parsed.data.projectId),
      eq(schema.studioProjects.userId, user.sub),
    ))
    .limit(1);
  if (!project) return c.json(fail("NOT_FOUND", "Project not found"), 404);

  // Gateway first, Workers AI fallback — a revoked gateway key degrades
  // instead of taking the caption down (#2309).
  const callAI = hasAiTextProvider(c.env)
    ? createAiTextCaller(c.env, user, { label: "linkedin_post_gen", useCase: "linkedin_post" })
    : null;
  try {
    return c.json(ok(await generateSocialCaption(project, { tone: parsed.data.tone, platforms: parsed.data.platforms }, callAI)));
  } catch (err) {
    // A model answered but not with a usable post: a typed AI_* envelope,
    // never the heuristic post dressed up as the AI's.
    return aiFailure(c, err, "[social/generate-caption] LLM error");
  }
});
