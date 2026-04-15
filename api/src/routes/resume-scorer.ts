import { Hono } from "hono";
import type { Variables } from "../types/index.js";
import { success } from "../types/index.js";
import { checkTokenBudget } from "../middleware/tierEnforcement.js";
import { billingFacade } from "../domains/billing/facade.js";
import { standardTierPolicy } from "../domains/billing/tier-policy.js";

export const resumeScorerRoutes = new Hono<{ Variables: Variables }>();

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
 * Shape the score response according to the caller's tier + the tier
 * policy's payload decision. Pure — takes the full score + payload
 * shape + upsell, returns the payload the route serializes. Pulled out
 * of the handler so it can be unit-tested without spinning up Hono,
 * auth, or the billing service (roadmap #150).
 */
export function shapeScorePayload(
  full: FullScore,
  payloadShape: "full" | "teaser" | "locked",
  upsell: { isPremiumPreview: true; upgradeUrl: string; lockedDetails: string[] },
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
      isPremiumPreview: upsell.isPremiumPreview,
      teaserRecommendation: teaser,
      lockedDetails: upsell.lockedDetails,
      upgradeUrl: upsell.upgradeUrl,
    };
  }
  // locked — anonymous callers get score + grade only, no teaser hint
  return {
    overallScore: full.overallScore,
    grade: full.grade,
    isPremiumPreview: upsell.isPremiumPreview,
    upgradeUrl: upsell.upgradeUrl,
  };
}

// ---------------------------------------------------------------------------
// POST /api/resumescorer/score
// Tier-aware payload: anonymous/free see previews, pro sees the full score.
// The branching lives in `standardTierPolicy` so tier experiments don't
// touch the route (roadmap #150).
// ---------------------------------------------------------------------------
resumeScorerRoutes.post("/score", async (c) => {
  const tier = await billingFacade.getTier(c.var.user);
  const payloadShape = standardTierPolicy.getPayloadShape(tier, "resume_scorer");
  const upsell = standardTierPolicy.getUpsellPayload("resume_scorer");
  const full = buildScoreResult();

  // Pro/admin tiers consume a token credit before the full response.
  if (payloadShape === "full") {
    const blocked = await checkTokenBudget(c);
    if (blocked) return blocked;
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
