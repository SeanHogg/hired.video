/**
 * Access Policy — decides what each audience sees for a given tool
 * feature. Replaces the hardcoded `if (!sub.isPro)` branches that
 * used to live inside tool routes (roadmap #150).
 *
 * NOTE on naming: the billing tiers are just Free and Pro (see
 * `audience.ts`). This policy dispatches on a wider `Audience` set —
 * anonymous visitors and admins get handled separately from billing
 * tiers. Treat "audience" as "policy input", not "billing plan".
 *
 * The policy answers two questions:
 *   1. `getPayloadShape(audience, feature)` — should the caller see
 *      the full response, a teaser, or an upsell-only payload?
 *   2. `getUpsellPayload(feature)` — the shape of the upsell CTA
 *      (locked fields, upgrade URL) to splice into the response.
 *
 * Adding a new audience is unlikely (Anonymous/Free/Pro/Admin covers
 * the full space today), but adding a new gated tool feature is a
 * matrix-table edit here — NOT a sweep across tool routes.
 */

import type { Audience } from "./audience.js";

/**
 * Tools the policy knows how to gate. Adding a tool is a two-step
 * change: register the feature here, then thread
 * `policy.getPayloadShape(audience, "my_tool")` through the route.
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
  isProPreview: true;
  upgradeUrl: string;
  lockedDetails: string[];
}

export interface AccessPolicy {
  /**
   * Return how much of the response this audience gets for this feature.
   *
   *  - `full`   → handler returns the complete response
   *  - `teaser` → handler returns score + grade + one hint
   *  - `locked` → handler returns the upsell CTA only
   */
  getPayloadShape(audience: Audience, feature: ToolFeature): PayloadShape;

  /**
   * Return the upsell CTA for this feature, to splice into preview
   * responses. Feature-specific so the locked-fields list matches the
   * tool being gated.
   */
  getUpsellPayload(feature: ToolFeature): UpsellPayload;
}

// ────────────────────────────────────────────────────────────────────────
// Standard policy — matches the current production behavior so the
// refactor is behavior-preserving. Pricing experiments change this
// table, not the route handlers.
// ────────────────────────────────────────────────────────────────────────

const UPGRADE_URL = "/settings/billing" as const;

const SCORER_LOCKED_DETAILS: readonly string[] = [
  "atsCompatibility",
  "contentQuality",
  "keywordScore",
  "formatScore",
  "impactScore",
  "strengths",
  "weaknesses",
];

const OPTIMIZER_LOCKED_DETAILS: readonly string[] = [
  "suggestions",
  "optimizedContent",
];

/**
 * Matrix of (audience × feature) → payload shape. Defaults to `"full"`
 * if a feature doesn't appear, so adding a feature to `ToolFeature`
 * doesn't accidentally lock it on day 1.
 */
const PAYLOAD_MATRIX: Record<Audience, Partial<Record<ToolFeature, PayloadShape>>> = {
  anonymous: {
    resume_scorer: "locked",
    resume_optimizer: "locked",
    salary_calculator: "locked",
    value_proposition: "locked",
    job_resume_match: "locked",
  },
  free: {
    resume_scorer: "teaser",
    resume_optimizer: "locked",
    salary_calculator: "locked",
    value_proposition: "locked",
    job_resume_match: "teaser",
  },
  pro: {
    resume_scorer: "full",
    resume_optimizer: "full",
    salary_calculator: "full",
    value_proposition: "full",
    job_resume_match: "full",
  },
  admin: {
    resume_scorer: "full",
    resume_optimizer: "full",
    salary_calculator: "full",
    value_proposition: "full",
    job_resume_match: "full",
  },
};

const UPSELL_BY_FEATURE: Record<ToolFeature, UpsellPayload> = {
  resume_scorer: {
    isProPreview: true,
    upgradeUrl: UPGRADE_URL,
    lockedDetails: [...SCORER_LOCKED_DETAILS],
  },
  resume_optimizer: {
    isProPreview: true,
    upgradeUrl: UPGRADE_URL,
    lockedDetails: [...OPTIMIZER_LOCKED_DETAILS],
  },
  salary_calculator: {
    isProPreview: true,
    upgradeUrl: UPGRADE_URL,
    lockedDetails: ["percentiles", "industryComparison", "locationAdjustment"],
  },
  value_proposition: {
    isProPreview: true,
    upgradeUrl: UPGRADE_URL,
    lockedDetails: ["valueProposition", "executiveSummary", "keyStrengths", "alignmentPoints", "callToAction"],
  },
  job_resume_match: {
    isProPreview: true,
    upgradeUrl: UPGRADE_URL,
    lockedDetails: ["detailedAnalysis", "skillGaps", "recommendations"],
  },
};

export const standardAccessPolicy: AccessPolicy = {
  getPayloadShape(audience, feature) {
    return PAYLOAD_MATRIX[audience]?.[feature] ?? "full";
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
