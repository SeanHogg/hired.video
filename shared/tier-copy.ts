/**
 * Single source of truth for tier names + user-visible copy.
 *
 * Both the API (error messages, notifications) AND the frontend (toasts,
 * page copy, badges) import from this file. There is no other place in
 * the codebase that should hardcode the strings "Pro" or "Premium" in
 * user-visible text — any drift between the two sides is a bug.
 *
 * Why a shared module instead of two parallel constants files:
 *   - Pricing copy used to drift between API 402 messages ("Premium
 *     feature. Upgrade to access it.") and frontend marketing ("Pro
 *     plan"). Same product, two names. Users got confused.
 *   - Renaming the tier (e.g. "Plus", "Premium" again) should be a
 *     one-line change, not a 30-file sweep.
 *   - Templates with parameters (feature name, free-tier limit) live
 *     here too — no inline string-interpolation in route handlers or
 *     React components.
 *
 * Internal API symbols (`isPro`, `requirePro`, `PRO_REQUIRED`
 * envelope code) are deliberately NOT touched by this module — they are
 * stable wire-format identifiers. Only user-readable copy is centralized
 * here.
 */

// ─── Tier names ─────────────────────────────────────────────────────────────

export const TIER_NAME = {
  /** Marketing name for the paid tier — used everywhere a user reads it. */
  pro: "Pro",
  /** Marketing name for the unpaid tier. */
  free: "Free",
} as const;

// ─── Tier IDs (wire format) ─────────────────────────────────────────────────
//
// Lowercase machine-readable identifiers the API and analytics use for
// the same tiers. Distinct from `TIER_NAME` because:
//   - API responses + analytics events conventionally use lowercase
//     ("pro" / "free"), while user-readable copy is title-case ("Pro").
//   - Renaming the display name (marketing) shouldn't necessarily change
//     persisted analytics events / wire-format strings.
//
// Both API and frontend import `TIER_ID` instead of writing the string
// literal — the TS type then forbids drift.

export const TIER_ID = {
  pro:  "pro",
  free: "free",
} as const;

export type TierId = (typeof TIER_ID)[keyof typeof TIER_ID];

// ─── Personalize-message API tier ───────────────────────────────────────────
//
// `POST /api/messages/personalize` returns a discriminated response:
// "basic" when we fell through to the generic template (no API key,
// over-budget, or Free), "pro" when the LLM produced a tailored message.
// The TS contract lives in shared/ so the API and the frontend dialog
// can't drift.

export const PERSONALIZE_TIER = {
  basic: "basic",
  pro:   TIER_ID.pro,
} as const;

export type PersonalizeTier = (typeof PERSONALIZE_TIER)[keyof typeof PERSONALIZE_TIER];

export interface PersonalizeResponse {
  tier: PersonalizeTier;
  subject: string;
  body: string;
  /** Optional upsell/footnote — populated by the basic-tier fallback. */
  note?: string;
}

// ─── Studio ad-template tier ────────────────────────────────────────────────
//
// `GET /api/studio/ad-templates` returns templates tagged with the lowest
// tier that may USE them. Free callers see Pro templates marked locked.
// Reuses the shared `TIER_ID` so renaming a tier touches one place.

export const AD_TEMPLATE_TIER = TIER_ID;
export type AdTemplateTier = TierId;

/** Standard upgrade CTA URL — single source so badge links + 402 envelope
 *  responses stay synchronized. */
export const UPGRADE_URL = "/settings/billing";

// ─── User-visible templates ─────────────────────────────────────────────────
// Every template is a pure function of its inputs so tests can pin output
// shape without snapshotting. New templates go in this object — never
// inline a "Pro" / "Free" / "Upgrade to..." literal in a route or component.

export const TIER_COPY = {
  /** 402 envelope message body for `requirePro("X")`. Returned to
   *  every paying user who hits a Pro-gated route on the Free tier. */
  proFeatureRequired: (featureName: string): string =>
    `${featureName} is a ${TIER_NAME.pro} feature. Upgrade to access it.`,

  /** Free-tier hard-limit refusal envelope. Used by `servicesProcessor.enforce`
   *  (team_invite, interview_session, video_publish, …) and any future
   *  per-period guard. */
  freeLimitReached: (input: { limit: number; unit: string }): string =>
    `${TIER_NAME.free} accounts are limited to ${input.limit} ${input.unit}. Upgrade to ${TIER_NAME.pro} to add more.`,

  /** Variant used when the limit is per calendar month and "unlimited"
   *  is the upgrade promise (interview practice). */
  freeMonthlyLimitReached: (input: { limit: number; unit: string }): string =>
    `${TIER_NAME.free} tier is limited to ${input.limit} ${input.unit} per month. Upgrade to ${TIER_NAME.pro} for unlimited ${input.unit}.`,

  /** Studio-style "you can publish 1 video" refusal. */
  freeQuotaExceededForFeature: (input: { freeAllowance: string; feature: string }): string =>
    `${TIER_NAME.free} accounts can ${input.freeAllowance}. Upgrade to ${TIER_NAME.pro} for unlimited ${input.feature}.`,

  /** Trial start notification — 14-day welcome message. */
  trialStarted: (trialEndDate: string): string =>
    `Enjoy full ${TIER_NAME.pro} access until ${trialEndDate}. Add a payment method before it ends to keep access.`,

  /** Trial-ending banner. `daysLeft` is already pluralized by caller. */
  trialEndingSoon: (input: { daysLeft: number }): string => {
    const dayWord = input.daysLeft === 1 ? "day" : "days";
    return `Your trial ends in ${input.daysLeft} ${dayWord}. Add a payment method to keep ${TIER_NAME.pro} access.`;
  },

  /** Generic "upgrade for X" hint surfaced near a teaser of a Pro feature. */
  upgradeForFeature: (featureBenefit: string): string =>
    `Upgrade to ${TIER_NAME.pro} for ${featureBenefit}.`,

  /** Post-payment success toast / headline. */
  welcomeAfterCheckout: (): string => `Welcome to ${TIER_NAME.pro}!`,

  /** Long-form post-payment confirmation. */
  paymentConfirmed: (): string =>
    `Your payment method has been successfully configured. Welcome to ${TIER_NAME.pro}!`,

  /** Card title shown on the post-checkout page. */
  proAccessGranted: (): string => `You now have access to ${TIER_NAME.pro} features`,

  /** Card subtitle shown on the post-checkout page. */
  proExploreInvitation: (): string =>
    `Start exploring all the powerful tools available to ${TIER_NAME.pro} members`,

  /** Toast title shown when a non-Pro user tries to use a Pro export option. */
  proRequiredToastTitle: (): string => `${TIER_NAME.pro} required`,

  /** Toast description for the same. */
  proRequiredToastBody: (featureBenefit: string): string =>
    `${featureBenefit} requires a ${TIER_NAME.pro} subscription.`,

  /** Generic "this is a Pro feature" inline label. */
  proFeatureLabel: (): string => `${TIER_NAME.pro} feature`,

  /** Used as a heading in upsell empty-states. */
  featureIsProOnly: (featureName: string): string =>
    `${featureName} is a ${TIER_NAME.pro} feature`,

  /** Marketing-page comparison-table cell label, e.g. "Pro library (50+)". */
  proCollectionLabel: (collectionSize: string): string =>
    `${TIER_NAME.pro} library (${collectionSize})`,

  /** Studio settings export-quality dropdown item suffix. */
  qualityProSuffix: (): string => TIER_NAME.pro,

  /** AI-message personalization upsell footnote. */
  upgradeForPersonalizedMessages: (): string =>
    `Upgrade to ${TIER_NAME.pro} for AI-personalized messages tailored to each recipient.`,

  /** AI chat panel error suffix when the LLM call is over budget. */
  upgradeForMoreAiTokens: (): string =>
    `Upgrade to ${TIER_NAME.pro} for more AI tokens.`,

  /** Surfaced when a Free user has consumed their monthly AI request
   *  allowance. Combines the consumed-count diagnostic with the
   *  upgrade CTA in one user-readable line. */
  aiRequestsExhausted: (input: { limit: number }): string =>
    `You've used all ${input.limit} ${TIER_NAME.free.toLowerCase()} AI requests for this month. Upgrade to ${TIER_NAME.pro} for more AI tokens.`,

  /** Chrome-extension FAQ — gated-features sentence. */
  proFeaturesGatedNote: (): string =>
    `${TIER_NAME.pro} features are gated behind paid hired.video plans, but the core extension is free.`,
} as const;
