/**
 * Studio features — AI delivery coaching. Mounted at /api/studio through the
 * routes/studio-features.ts barrel (split out of that file; paths unchanged).
 */
import { Hono } from "hono";
import { z } from "zod";
import { UuidLikeSchema } from "../../../../shared/validation.js";
import type { AppEnv } from "../../types/index.js";
import { createLLMClient, hasAnyLLMProviderKey } from "../../services/adapters/llm-client.js";
import { analyzeDelivery, generateSuggestions } from "../../services/adapters/transcription.js";
import { getLatestDeliveryCoaching, saveDeliveryCoaching } from "../../services/studio/recordings.js";
import { success, error } from "../../types/index.js";
import { validateJson } from "../helpers/validate.js";

export const coachingRoutes = new Hono<AppEnv>();

// ═══════════════════════════════════════════════════════════════════════════════
// ██  5. AI DELIVERY COACHING
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/studio/coaching/analyze — analyze a recording for delivery quality
coachingRoutes.post("/coaching/analyze", validateJson(z.object({
    recordingId: UuidLikeSchema,
    projectId: UuidLikeSchema.optional(),
    words: z.array(z.object({
      word: z.string(),
      start: z.number(),
      end: z.number(),
    })),
    totalDurationSec: z.number(),
    // Optional: AI analysis of message clarity
    scriptText: z.string().optional(),
    transcribedText: z.string().optional(),
  }), () => error("VALIDATION_ERROR", "Invalid request"), { emptyBody: null }), async (c) => {
  const user = c.var.user;
  const body = c.req.valid("json");


  const metrics = analyzeDelivery(body.words, body.totalDurationSec);
  const suggestions = generateSuggestions(metrics);

  // AI clarity analysis if both script and transcription are provided
  let clarityScore = 70; // default
  if (hasAnyLLMProviderKey(c.env) && body.scriptText && body.transcribedText) {
    try {
      const clarityPrompt = `Compare the intended script with the actual transcription. Score how well the speaker communicated the intended message on a scale of 0-100.

Intended script:
${body.scriptText.slice(0, 2000)}

Actual transcription:
${body.transcribedText.slice(0, 2000)}

Return ONLY a JSON object: {"score": <number>, "feedback": "<one sentence>"}`;

      const llm = createLLMClient(c.env, c.var.user);
      const { content } = await llm.callText("studio_clarity_score", {
        useCase: "reviews",
        systemPrompt: "You are a speech coach. Evaluate message clarity. Return JSON only.",
        userMessage: clarityPrompt,
      });
      const clarityResult = JSON.parse(content.replace(/```json?\s*/g, "").replace(/```/g, ""));
      clarityScore = Math.min(100, Math.max(0, clarityResult.score ?? 70));
      if (clarityResult.feedback) {
        suggestions.push({ type: "clarity", message: clarityResult.feedback });
      }
    } catch {
      // Fall back to default
    }
  }

  // Overall score: weighted average
  const overallScore = Math.round(
    metrics.pacingScore * 0.25 +
    metrics.fillerScore * 0.25 +
    metrics.energyScore * 0.25 +
    clarityScore * 0.25,
  );

  const coaching = await saveDeliveryCoaching({
    userId: user.sub,
    recordingId: body.recordingId,
    projectId: body.projectId ?? null,
    overallScore,
    pacingWpm: metrics.wpm,
    pacingScore: metrics.pacingScore,
    fillerWords: metrics.fillerWords,
    fillerScore: metrics.fillerScore,
    eyeContactPct: null,         // requires face-tracking (frontend-side)
    eyeContactScore: null,
    energyScore: metrics.energyScore,
    clarityScore,
    suggestions,
  });

  return c.json(success({
    id: coaching.id,
    overallScore,
    pacingWpm: metrics.wpm,
    pacingScore: metrics.pacingScore,
    fillerWords: metrics.fillerWords,
    fillerScore: metrics.fillerScore,
    energyScore: metrics.energyScore,
    clarityScore,
    suggestions,
  }), 201);
});

// GET /api/studio/coaching/:recordingId — get coaching results for a recording
coachingRoutes.get("/coaching/:recordingId", async (c) => {
  const user = c.var.user;
  const recordingId = c.req.param("recordingId");
  return c.json(success(await getLatestDeliveryCoaching(user.sub, recordingId)));
});
