import { Hono } from "hono";
import type { Env, Variables } from "../types/index.js";
import { success } from "../types/index.js";
import { attachTokenBudget, checkTokenBudget } from "../middleware/tierEnforcement.js";
import { billingFacade } from "../domains/billing/facade.js";
import { standardAccessPolicy } from "../domains/billing/access-policy.js";
import { persistResumeScoresIfReferenced } from "../services/resume/persist-scores.js";
import { scoreWithLLMOrFallback } from "../services/resume/score-with-llm.js";
import { FullResumeScoreSchema } from "../../../shared/tool-schemas.js";

export const resumeScorerRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();
resumeScorerRoutes.use("*", attachTokenBudget());

/**
 * Deterministic fallback used when the LLM is unavailable (no API key
 * in dev/test, or upstream errors). Same shape the LLM is asked to
 * return — `FullResumeScoreSchema` validates both paths.
 */
export function buildScoreResult() {
  return {
    overallScore: 74,
    atsCompatibility: 78,
    contentQuality: 72,
    keywordScore: 70,
    formatScore: 76,
    impactScore: 71,
    grade: "B",
    strengths: ["Clear structure", "Action-oriented language"],
    weaknesses: ["Could add more measurable outcomes"],
    recommendations: [
      {
        category: "important",
        title: "Add quantified achievements",
        description: "Include metrics such as percentages, revenue, or time saved.",
        impact: 8,
      },
    ],
  };
}

type FullScore = ReturnType<typeof buildScoreResult>;

/**
 * Project the full score result into the JSONB blob persisted on the
 * resume row. Pure — extracted so the optimizer route (which uses
 * different field names internally) can do the same projection from
 * its own shape; see `optimizationToScores` in resume-optimizer.ts.
 */
export function scoreToScores(full: FullScore): Record<string, number> {
  return {
    overall: full.overallScore,
    ats: full.atsCompatibility,
    content: full.contentQuality,
    keyword: full.keywordScore,
    format: full.formatScore,
    impact: full.impactScore,
  };
}

/**
 * Shape the score response according to the caller's tier + the tier
 * policy's payload decision. Pure — takes the full score + payload
 * shape + upsell, returns the payload the route serializes. Pulled out
 * of the handler so it can be unit-tested without spinning up Hono,
 * auth, or the billing service (roadmap #150).
 */
export function shapeScorePayload(
  full: FullScore,
  payloadShape: "full" | "teaser" | "locked",
  upsell: { isProPreview: true; upgradeUrl: string; lockedDetails: string[] },
) {
  if (payloadShape === "full") {
    return full;
  }
  if (payloadShape === "teaser") {
    const teaser = full.recommendations[0]
      ? { title: full.recommendations[0].title, impact: full.recommendations[0].impact }
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
  // locked — anonymous callers get score + grade only, no teaser hint
  return {
    overallScore: full.overallScore,
    grade: full.grade,
    isProPreview: upsell.isProPreview,
    upgradeUrl: upsell.upgradeUrl,
  };
}

const SCORER_SYSTEM_PROMPT = `You are an expert resume reviewer scoring a candidate's resume across six dimensions used by ATS systems and senior hiring managers. Return ONLY valid JSON in this exact shape:

{
  "overallScore": <0-100>,
  "atsCompatibility": <0-100>,
  "contentQuality": <0-100>,
  "keywordScore": <0-100>,
  "formatScore": <0-100>,
  "impactScore": <0-100>,
  "grade": "<A+|A|A-|B+|B|B-|C+|C|C-|D|F>",
  "strengths": [<2-4 specific strengths>],
  "weaknesses": [<2-4 specific weaknesses>],
  "recommendations": [
    {
      "category": "critical" | "important" | "minor",
      "title": "<short imperative>",
      "description": "<1-2 sentence explanation>",
      "impact": <1-10>
    }
  ]
}

Scoring guide (calibrate honestly, don't grade-inflate):
- atsCompatibility: parseable structure, standard section names, no tables/columns/images
- contentQuality: clarity, specificity, no jargon-without-substance
- keywordScore: density of role-relevant skills/technologies
- formatScore: readability, consistent dates/structure, scannable bullets
- impactScore: quantified outcomes (numbers, %, $, scale) over responsibility lists
- overallScore: weighted summary (NOT a simple average — impact + content matter most)
- grade: A=85-100, B=70-84, C=55-69, D=40-54, F<40

Recommendations should be specific to THIS resume (quote phrases when possible), not generic advice.`;

// ---------------------------------------------------------------------------
// POST /api/resumescorer/score
// Audience-aware payload: anonymous → locked, free → teaser, pro/admin
// → full. The branching lives in `standardAccessPolicy` so pricing
// experiments don't touch the route (roadmap #150).
//
// Scoring path: try the LLM, fall back to a deterministic constant
// shape when no API key is configured (dev / unit tests) or the LLM
// errors. Same try-then-fallback pattern as resume-roast.ts.
// ---------------------------------------------------------------------------
resumeScorerRoutes.post("/score", async (c) => {
  const audience = await billingFacade.getAudience(c.var.user);
  const payloadShape = standardAccessPolicy.getPayloadShape(audience, "resume_scorer");
  const upsell = standardAccessPolicy.getUpsellPayload("resume_scorer");

  // Full responses consume a token credit (admins bypass inside the middleware).
  if (payloadShape === "full") {
    const blocked = await checkTokenBudget(c);
    if (blocked) return blocked;
  }

  const body = await c.req.json().catch(() => null);
  const resumeText =
    typeof body === "object" && body !== null && typeof (body as any).resumeText === "string"
      ? ((body as any).resumeText as string)
      : "";

  const llmOrFallback = await scoreWithLLMOrFallback({
    c,
    featureKey: "resume_scorer",
    useCase: "resume_optimize",
    resumeText,
    systemPrompt: SCORER_SYSTEM_PROMPT,
    userMessage: `Score this resume:\n\n${resumeText}`,
    schema: FullResumeScoreSchema,
    fallback: buildScoreResult(),
  });
  if (llmOrFallback instanceof Response) return llmOrFallback;
  const full: FullScore = llmOrFallback;

  // Only the full payload writes scores; teaser/locked previews don't
  // expose enough numbers to be worth persisting.
  if (payloadShape === "full") {
    await persistResumeScoresIfReferenced(body, c.var.user, scoreToScores(full));
  }

  return c.json(success(shapeScorePayload(full, payloadShape, upsell)), 200);
});

resumeScorerRoutes.post("/category-breakdown", async (c) =>
  c.json(success({
    atsCompatibility: 78,
    contentQuality: 72,
    keywordScore: 70,
    formatScore: 76,
    impactScore: 71,
  }), 200),
);

resumeScorerRoutes.post("/recommendations", async (c) =>
  c.json(success(buildScoreResult().recommendations), 200),
);

resumeScorerRoutes.all("*", (c) =>
  c.json(
    { success: false as const, error: { code: "NOT_IMPLEMENTED", message: "Resume scorer route not implemented" }, timestamp: new Date().toISOString() },
    501,
  ),
);
