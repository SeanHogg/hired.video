/**
 * Studio features — AI hook optimizer. Mounted at /api/studio through the
 * routes/studio-features.ts barrel (split out of that file; paths unchanged).
 */
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { UuidLikeSchema } from "../../../../shared/validation.js";
import type { AppEnv } from "../../types/index.js";
import { getDb } from "../../db/index.js";
import { createLLMClient, hasAnyLLMProviderKey } from "../../services/adapters/llm-client.js";
import { aiFailure } from "../../services/adapters/llm-error.js";
import { ok, fail, studioVideoHeatmap } from "./shared.js";

export const hookOptimizerRoutes = new Hono<AppEnv>();

// ═══════════════════════════════════════════════════════════════════════════════
// ██  19. AI HOOK OPTIMIZER — gap #143
// ██
// ██  Analyses scene 0 of a storyboard for retention killers and returns 3
// ██  alternative scripted hook variants. Reuses delivery coach signals
// ██  (filler %, pacing) and drop-off data from `studio_video_heatmap` (#122)
// ██  if the project has been published. The model is instructed to keep
// ██  scene `type`, `visual`, and `camera` identical so the rewrite slots
// ██  back into the existing storyboard verbatim.
// ═══════════════════════════════════════════════════════════════════════════════

hookOptimizerRoutes.post("/projects/:projectId/hook/optimize", async (c) => {
  const projectId = c.req.param("projectId");
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({
    storyboard: z.unknown(),
    /** Optional: explicit projectId to pull retention data from */
    projectId: UuidLikeSchema.optional(),
  }).safeParse(body);
  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid body", parsed.error.flatten()), 400);

  if (!hasAnyLLMProviderKey(c.env)) return c.json(fail("AI_UNAVAILABLE", "LLM API key not configured"), 503);

  const sb = parsed.data.storyboard as { scenes?: Array<Record<string, any>> } | null;
  const scene0 = sb?.scenes?.[0];
  if (!scene0) return c.json(fail("VALIDATION_ERROR", "storyboard has no scenes"), 400);

  const db = getDb();

  // Pull retention signals if a projectId was supplied. We compute the
  // average % of viewers who dropped within the first 3 seconds and the
  // most common drop-off second so the LLM can be told *why* the hook is
  // failing rather than just told to rewrite it.
  let retentionDiagnosis: {
    earlyDropPct: number | null;
    topDropOffSecond: number | null;
    sampleSize: number;
  } = { earlyDropPct: null, topDropOffSecond: null, sampleSize: 0 };

  if (parsed.data.projectId) {
    const views = await db.select().from(studioVideoHeatmap)
      .where(eq(studioVideoHeatmap.studioProjectId, parsed.data.projectId))
      .limit(500);
    if (views.length > 0) {
      const earlyDrops = views.filter((v) => (v.dropOffSecond ?? 999) <= 3).length;
      const dropCounts: Record<number, number> = {};
      for (const v of views) {
        if (v.dropOffSecond != null) {
          dropCounts[v.dropOffSecond] = (dropCounts[v.dropOffSecond] ?? 0) + 1;
        }
      }
      const top = Object.entries(dropCounts).sort(([, a], [, b]) => b - a)[0];
      retentionDiagnosis = {
        earlyDropPct: Math.round((earlyDrops / views.length) * 100),
        topDropOffSecond: top ? Number(top[0]) : null,
        sampleSize: views.length,
      };
    }
  }

  const HookSchema = z.object({
    diagnosis: z.string(),
    variants: z.array(z.object({
      label: z.string(),
      title: z.string().optional(),
      subtitle: z.string().optional(),
      text: z.string().optional(),
      rationale: z.string(),
    })).min(1).max(5),
  });

  const retentionContext = retentionDiagnosis.sampleSize > 0
    ? `Retention data from ${retentionDiagnosis.sampleSize} views: ${retentionDiagnosis.earlyDropPct}% of viewers drop within the first 3 seconds. Top drop-off second: ${retentionDiagnosis.topDropOffSecond}s. The current hook is empirically losing viewers.`
    : "No retention data yet — score the current hook against general best-practice patterns for short-form video (face on screen by 1 s, conflict / curiosity gap by 2 s, payoff promised by 3 s).";

  try {
    const llm = createLLMClient(c.env, c.var.user);
    const { data } = await llm.callJson(
      "studio_hook_optimize",
      {
        useCase: "studio_script",
        systemPrompt: "You are a short-form video retention expert. You analyse the first 3 seconds of a video script and propose stronger alternative hooks. Hooks must be scripted text — no production directions. Preserve the scene's structural fields (type/visual/camera).",
        userMessage: `Current scene 0:\n${JSON.stringify(scene0, null, 2)}\n\n${retentionContext}\n\nReturn JSON: {\n  "diagnosis": "what is wrong with the current hook in 1-2 sentences",\n  "variants": [\n    { "label": "Curiosity gap", "title": "...", "text": "...", "rationale": "..." },\n    { "label": "Pattern interrupt", ... },\n    { "label": "Bold claim", ... }\n  ]\n}\nGenerate exactly 3 variants.`,
      },
      HookSchema,
    );

    return c.json(ok({
      projectId,
      diagnosis: data.diagnosis,
      variants: data.variants,
      retention: retentionDiagnosis,
    }));
  } catch (err) {
    return aiFailure(c, err, "[hook/optimize] LLM error");
  }
});
