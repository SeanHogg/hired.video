/**
 * resume-score + resume-optimize — two surfaces over the ONE analysis
 * engine (services/resume/analyze.ts), so they never drift on what counts
 * as a recommendation. Both stream when asked (#1342).
 */
import { z } from "zod";
import type { ResumeAnalysis } from "../../../../../shared/tool-schemas.js";
import { standardAccessPolicy } from "../../../domains/billing/access-policy.js";
import { billingFacade } from "../../../domains/billing/facade.js";
import { checkTokenBudget } from "../../../middleware/tierEnforcement.js";
import { success } from "../../../types/index.js";
import type { LLMStreamSink } from "../../adapters/llm-client.js";
import { aiStreamResponse, wantsEventStream } from "../../adapters/ai-stream-response.js";
import { analysisToScores, analyzeResume } from "../../resume/analyze.js";
import { persistResumeScoresIfReferenced } from "../../resume/persist-scores.js";
import { resolveResumeContent } from "../../resume/resolve-resume-content.js";
import { defineAiTool } from "../types.js";

/** `{ resumeText }` (paste / upload) or `{ resumeId }` (saved résumé — the
 *  score is then persisted on it). */
const AnalysisRequestSchema = z
  .object({
    resumeText: z.string().optional(),
    resumeId: z.string().optional(),
    jobDescription: z.string().optional(),
  })
  .passthrough();

/**
 * Scorer payload by tier (anonymous → locked, free → teaser, pro/admin →
 * full). The scorer never ships `optimizedContent` — that affordance is the
 * optimizer's upsell. Pure for unit tests (roadmap #150).
 */
export function shapeScorerPayload(
  full: ResumeAnalysis,
  payloadShape: "full" | "teaser" | "locked",
  upsell: { isProPreview: true; upgradeUrl: string; lockedDetails: string[] },
) {
  if (payloadShape === "full") {
    const { optimizedContent: _drop, ...rest } = full;
    return rest;
  }
  if (payloadShape === "teaser") {
    const first = full.recommendations[0];
    return {
      overallScore: full.overallScore,
      grade: full.grade,
      isProPreview: upsell.isProPreview,
      teaserRecommendation: first ? { title: first.title, impact: first.impact ?? 0 } : null,
      lockedDetails: upsell.lockedDetails,
      upgradeUrl: upsell.upgradeUrl,
    };
  }
  return { overallScore: full.overallScore, grade: full.grade, isProPreview: upsell.isProPreview, upgradeUrl: upsell.upgradeUrl };
}

/** The optimizer leads with `optimizedContent` + per-recommendation
 *  actions, so the scorer's prose strengths/weaknesses are dropped. */
export function shapeOptimizerPayload(full: ResumeAnalysis): Omit<ResumeAnalysis, "strengths" | "weaknesses"> {
  const { strengths: _s, weaknesses: _w, ...rest } = full;
  return rest;
}

export const resumeScoreTool = defineAiTool({
  id: "resume-score",
  schema: AnalysisRequestSchema,
  tokenBudget: "handler",
  useCase: "resume_optimize",
  moduleSlug: "resume-scorer",
  handler: async (c, input) => {
    const audience = await billingFacade.getAudience(c.var.user);
    const payloadShape = standardAccessPolicy.getPayloadShape(audience, "resume_scorer");
    const upsell = standardAccessPolicy.getUpsellPayload("resume_scorer");
    // Only a full payload spends tokens worth gating.
    if (payloadShape === "full") {
      const blocked = await checkTokenBudget(c);
      if (blocked) return blocked;
    }
    const score = async (stream?: LLMStreamSink) => {
      const { resumeText } = await resolveResumeContent(c, input);
      const full = await analyzeResume({ c, featureKey: "resume_scorer", resumeText, stream });
      if (payloadShape === "full") await persistResumeScoresIfReferenced(input, c.var.user, analysisToScores(full));
      return shapeScorerPayload(full, payloadShape, upsell);
    };
    // A teaser must not leak (by streaming) the recommendations it locks.
    if (wantsEventStream(c)) {
      return aiStreamResponse(c, score, { stream: payloadShape === "full", tag: "[resume_scorer] stream" });
    }
    return c.json(success(await score()), 200);
  },
});

export const resumeOptimizeTool = defineAiTool({
  id: "resume-optimize",
  schema: AnalysisRequestSchema,
  tokenBudget: "gate",
  useCase: "resume_optimize",
  moduleSlug: "resume-optimizer",
  handler: async (c, input) => {
    const { resumeText } = await resolveResumeContent(c, input);
    const optimize = async (stream?: LLMStreamSink) => {
      const full = await analyzeResume({
        c,
        featureKey: "resume_optimizer",
        resumeText,
        jobDescription: input.jobDescription ?? "",
        stream,
      });
      await persistResumeScoresIfReferenced(input, c.var.user, analysisToScores(full));
      return shapeOptimizerPayload(full);
    };
    if (wantsEventStream(c)) return aiStreamResponse(c, optimize, { tag: "[resume_optimizer] stream" });
    return c.json(success(await optimize()), 200);
  },
});
