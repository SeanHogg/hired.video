/**
 * Tier Policy — decides what each tier is allowed to see for a given
 * tool feature. Replaces the hardcoded `if (!sub.isPremium)` branches
 * scattered across tool routes (roadmap #150).
 *
 * The policy answers two questions:
 *   1. `getPayloadShape(tier, feature)` — should the caller see the
 *      full response, a teaser, or an upsell-only payload?
 *   2. `getUpsellPayload(feature)` — the shape of the upsell CTA
 *      (locked fields, upgrade URL) to splice into the response.
 *
 * Adding a new tier (e.g., `team` or `trial`) or a new feature is a
 * matrix-table edit here, NOT a sweep across tool routes.
 */

import type { Tier } from "./tier.js";

/**
 * Enum of features the tier policy knows how to gate. Keep this list
 * stable — adding a tool is a two-step change: register the feature,
 * then thread `policy.getPayloadShape("resume_scorer", tier)` through
 * the route.
 */
export type ToolFeature =
  | "resume_scorer"
  | "resume_optimizer"
  | "salary_calculator"
  | "value_proposition"
  | "job_resume_match";

/** How much of the response the caller gets to see. */
export type PayloadShape = "full" | "teaser" | "locked";

/**
 * Canonical upsell CTA that tool routes splice into preview responses.
 * Frontend reads `upgradeUrl` to build the CTA link; `lockedDetails`
 * populates the "sign in / upgrade to unlock" hint list in the UI.
 */
export interface UpsellPayload {
  isPremiumPreview: true;
  upgradeUrl: string;
  lockedDetails: string[];
}

export interface TierPolicy {
  /**
   * Return how much of the response this tier gets for this feature.
   *
   *  - `full`   → the handler returns the complete response
   *  - `teaser` → the handler returns score + grade + one hint
   *  - `locked` → the handler returns the upsell CTA only
   */
  getPayloadShape(tier: Tier, feature: ToolFeature): PayloadShape;

  /**
   * Return the upsell CTA for this feature, to splice into preview
   * responses. Feature-specific so the locked-fields list can be
   * accurate (the scorer hides different fields than the optimizer).
   */
  getUpsellPayload(feature: ToolFeature): UpsellPayload;
}

// ────────────────────────────────────────────────────────────────────────
// Standard policy — matches the current production behavior so the
// refactor is behavior-preserving. Pricing experiments change this
// table, not the route handlers.
// ────────────────────────────────────────────────────────────────────────

const UPGRADE_URL = "/settings/billing" as const;

/** Fields a free-tier scorer response hides behind the upsell. */
const SCORER_LOCKED_DETAILS: readonly string[] = [
  "atsCompatibility",
  "contentQuality",
  "keywordScore",
  "formatScore",
  "impactScore",
  "strengths",
  "weaknesses",
];

/** Fields a free-tier optimizer response hides (placeholder for future use). */
const OPTIMIZER_LOCKED_DETAILS: readonly string[] = [
  "suggestions",
  "optimizedContent",
];

/**
 * Matrix of (tier × feature) → payload shape. Defaults to `full` if a
 * feature doesn't appear, so adding a feature to `ToolFeature` doesn't
 * accidentally lock it on day 1.
 */
const PAYLOAD_MATRIX: Record<Tier, Partial<Record<ToolFeature, PayloadShape>>> = {
  anonymous: {
    // Anonymous sees a locked upsell for every tool — the score + grade
    // only, no breakdown. Matches the pre-refactor scorer behavior.
    resume_scorer: "locked",
    resume_optimizer: "locked",
    salary_calculator: "locked",
    value_proposition: "locked",
    job_resume_match: "locked",
  },
  free: {
    // Free authenticated users see a teaser (score + grade + one hint)
    // for the scorer, locked for everything else.
    resume_scorer: "teaser",
    resume_optimizer: "locked",
    salary_calculator: "locked",
    value_proposition: "locked",
    job_resume_match: "teaser",
  },
  pro: {
    // Pro gets everything (subject to token-budget middleware).
    resume_scorer: "full",
    resume_optimizer: "full",
    salary_calculator: "full",
    value_proposition: "full",
    job_resume_match: "full",
  },
  admin: {
    // Admin bypasses all gating.
    resume_scorer: "full",
    resume_optimizer: "full",
    salary_calculator: "full",
    value_proposition: "full",
    job_resume_match: "full",
  },
};

const UPSELL_BY_FEATURE: Record<ToolFeature, UpsellPayload> = {
  resume_scorer: {
    isPremiumPreview: true,
    upgradeUrl: UPGRADE_URL,
    lockedDetails: [...SCORER_LOCKED_DETAILS],
  },
  resume_optimizer: {
    isPremiumPreview: true,
    upgradeUrl: UPGRADE_URL,
    lockedDetails: [...OPTIMIZER_LOCKED_DETAILS],
  },
  salary_calculator: {
    isPremiumPreview: true,
    upgradeUrl: UPGRADE_URL,
    lockedDetails: ["percentiles", "industryComparison", "locationAdjustment"],
  },
  value_proposition: {
    isPremiumPreview: true,
    upgradeUrl: UPGRADE_URL,
    lockedDetails: ["valueProposition", "executiveSummary", "keyStrengths", "alignmentPoints", "callToAction"],
  },
  job_resume_match: {
    isPremiumPreview: true,
    upgradeUrl: UPGRADE_URL,
    lockedDetails: ["detailedAnalysis", "skillGaps", "recommendations"],
  },
};

export const standardTierPolicy: TierPolicy = {
  getPayloadShape(tier, feature) {
    return PAYLOAD_MATRIX[tier]?.[feature] ?? "full";
  },
  getUpsellPayload(feature) {
    return UPSELL_BY_FEATURE[feature];
  },
};

// Internal exports for test visibility — do NOT import from route files.
export const _internal = {
  PAYLOAD_MATRIX,
  UPSELL_BY_FEATURE,
  UPGRADE_URL,
  SCORER_LOCKED_DETAILS,
};
