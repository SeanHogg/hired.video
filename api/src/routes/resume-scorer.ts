import { Hono } from "hono";
import type { Env, Variables, AppEnv } from "../types/index.js";
import { success } from "../types/index.js";
import { attachTokenBudget, checkTokenBudget } from "../middleware/tierEnforcement.js";
import { billingFacade } from "../domains/billing/facade.js";
import { standardAccessPolicy } from "../domains/billing/access-policy.js";
import { persistResumeScoresIfReferenced } from "../services/resume/persist-scores.js";
import { resolveResumeContent } from "../services/resume/resolve-resume-content.js";
import {
  analyzeResume,
  analysisToScores,
  buildAnalysisFallback,
} from "../services/resume/analyze.js";
import type { ResumeAnalysis } from "../../../shared/tool-schemas.js";
import type { LLMStreamSink } from "../services/adapters/llm-client.js";
import { aiStreamResponse, wantsEventStream } from "../services/adapters/ai-stream-response.js";

export const resumeScorerRoutes = new Hono<AppEnv>();
resumeScorerRoutes.use("*", attachTokenBudget());

/**
 * Shape the response according to the caller's tier. The Scorer route
 * intentionally drops `optimizedContent` from the payload — that
 * affordance lives on the Optimizer route's funnel for upsell
 * differentiation. Pure for unit-testability (roadmap #150).
 */
export function shapeScorerPayload(
  full: ResumeAnalysis,
  payloadShape: "full" | "teaser" | "locked",
  upsell: { isProPreview: true; upgradeUrl: string; lockedDetails: string[] },
) {
  if (payloadShape === "full") {
    // Strip optimizedContent — the Scorer surface doesn't render it.
    // Frontend self-gates on whether `optimizedContent` is present.
    const { optimizedContent: _drop, ...rest } = full;
    return rest;
  }
  if (payloadShape === "teaser") {
    const teaser = full.recommendations[0]
      ? { title: full.recommendations[0].title, impact: full.recommendations[0].impact ?? 0 }
      : null;
    return {
      overallScore: full.overallScore,
      grade: full.grade,
      isProPreview: upsell.isProPreview,
      teaserRecommendation: teaser,
      lockedDetails: upsell.lockedDetails,
      upgradeUrl: upsell.upgradeUrl,
    };
  }
  return {
    overallScore: full.overallScore,
    grade: full.grade,
    isProPreview: upsell.isProPreview,
    upgradeUrl: upsell.upgradeUrl,
  };
}

// ---------------------------------------------------------------------------
// POST /api/resumescorer/score
// Audience-aware payload (anonymous → locked, free → teaser, pro/admin
// → full). Scoring engine itself lives in services/resume/analyze.ts —
// shared with /api/resumeoptimizer/optimize so the two surfaces never
// drift on what counts as a recommendation.
// ---------------------------------------------------------------------------
resumeScorerRoutes.post("/score", async (c) => {
  const audience = await billingFacade.getAudience(c.var.user);
  const payloadShape = standardAccessPolicy.getPayloadShape(audience, "resume_scorer");
  const upsell = standardAccessPolicy.getUpsellPayload("resume_scorer");

  if (payloadShape === "full") {
     
    const blocked = await checkTokenBudget(c as any);
    if (blocked) return blocked;
  }

  const body = await c.req.json().catch(() => null);
  const score = async (stream?: LLMStreamSink) => {
    const { resumeText } = await resolveResumeContent(c, body);
    const full = await analyzeResume({ c, featureKey: "resume_scorer", resumeText, stream });
    if (payloadShape === "full") {
      await persistResumeScoresIfReferenced(body, c.var.user, analysisToScores(full));
    }
    return shapeScorerPayload(full, payloadShape, upsell);
  };

  // Streamed (#1342): only a full-payload caller sees the answer as it is
  // written — a teaser must not leak the recommendations it locks.
  if (wantsEventStream(c)) {
    return aiStreamResponse(c, score, { stream: payloadShape === "full", tag: "[resume_scorer] stream" });
  }
  return c.json(success(await score()), 200);
});

resumeScorerRoutes.all("*", (c) =>
  c.json(
    { success: false as const, error: { code: "NOT_IMPLEMENTED", message: "Resume scorer route not implemented" }, timestamp: new Date().toISOString() },
    501,
  ),
);

// Re-export for tests that exercise the fallback shape directly.
export { buildAnalysisFallback as buildScoreResult };
