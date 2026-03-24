import { Hono } from "hono";
import type { Variables } from "../types/index.js";
import { checkAIUsage } from "../middleware/tierEnforcement.js";
import { getSubscription } from "../services/billing.js";

export const resumeScorerRoutes = new Hono<{ Variables: Variables }>();

function ok<T>(data: T) {
  return { success: true as const, data, timestamp: new Date().toISOString() };
}

function buildScoreResult() {
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

// ---------------------------------------------------------------------------
// POST /api/resume-scorer/score
// Free users: see overallScore + grade only (the upsell hook, #60).
// Premium users: see full breakdown — gated by AI usage check.
// ---------------------------------------------------------------------------
resumeScorerRoutes.post("/score", async (c) => {
  const userId = c.var.user?.sub;
  const full = buildScoreResult();

  if (!userId) {
    // Unauthenticated: show score only, prompt sign-up
    return c.json(ok({
      result: JSON.stringify({
        overallScore: full.overallScore,
        grade: full.grade,
        isPremiumPreview: true,
        upgradeUrl: "/settings/billing",
      }),
    }), 200);
  }

  // Check if user is premium
  const sub = await getSubscription(userId);

  if (!sub.isPremium) {
    // Free tier: show score + top 1 recommendation teaser, gate rest
    return c.json(ok({
      result: JSON.stringify({
        overallScore: full.overallScore,
        grade: full.grade,
        isPremiumPreview: true,
        teaserRecommendation: full.recommendations[0]
          ? { title: full.recommendations[0].title, impact: full.recommendations[0].impact }
          : null,
        lockedDetails: ["atsCompatibility", "contentQuality", "keywordScore", "formatScore", "impactScore", "strengths", "weaknesses"],
        upgradeUrl: "/settings/billing",
      }),
    }), 200);
  }

  // Premium: full result, consume an AI credit
  const limitError = await checkAIUsage(c as any);
  if (limitError) return limitError;
  return c.json(ok({ result: JSON.stringify(full) }), 200);
});

resumeScorerRoutes.post("/category-breakdown", async (c) =>
  c.json(ok({
    atsCompatibility: 78,
    contentQuality: 72,
    keywordScore: 70,
    formatScore: 76,
    impactScore: 71,
  }), 200),
);

resumeScorerRoutes.post("/recommendations", async (c) =>
  c.json(ok(buildScoreResult().recommendations), 200),
);

resumeScorerRoutes.all("*", (c) =>
  c.json(
    { success: false, error: { code: "NOT_IMPLEMENTED", message: "Resume scorer route not implemented" }, timestamp: new Date().toISOString() },
    501,
  ),
);
