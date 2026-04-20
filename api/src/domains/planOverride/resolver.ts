/**
 * Pure plan-override resolver.
 *
 * Given (a) a user's "real" subscription-derived plan + limit and (b) an
 * optional admin override row, produce the *effective* plan + limit the
 * user should see right now.
 *
 * Why a separate module? Single Responsibility. The resolver has no I/O,
 * no clock of its own, no DB, no audit writes — just the decision. Every
 * call site that currently computes plan/limit inline (searchUsers,
 * tierEnforcement, AI budget checks, billing UI) can converge on this
 * one function, so "what plan is this user on right now?" has exactly
 * one answer across the codebase (DRY).
 *
 * The caller is responsible for passing `now` — it's injected, not read
 * from the system clock, so tests are deterministic and the resolver is
 * trivially testable without mocks.
 */

import {
  FREE_AI_MONTHLY_TOKENS,
  PRO_AI_MONTHLY_TOKENS,
} from "../../../../shared/pricing.js";

/** Sentinel stored in `monthly_token_limit` meaning "no cap". Zero is a
 *  valid real value ("this user cannot use any tokens"), so we can't
 *  use nullability to distinguish "unlimited" from "use default". */
export const UNLIMITED_TOKEN_LIMIT = -1 as const;

/** The canonical plan identifiers. Kept here (not in the resolver's
 *  consumers) so the set of plans is a single-source-of-truth concept
 *  in the plan-override domain. */
export type PlanSlug = "free" | "pro" | "unlimited" | "admin";

/** The minimum information the resolver needs about the user's
 *  subscription. The full subscription row is *not* required — this
 *  keeps the resolver decoupled from the billing schema. */
export interface SubscriptionSnapshot {
  /** e.g. "free", "pro". null means no subscription row at all. */
  planSlug: string | null;
  /** Display-friendly plan name, e.g. "Pro". null when planSlug is null. */
  planName: string | null;
  /** True when the user is internal staff (SuperAdmin / Admin role /
   *  is_super_admin flag). Internal users always resolve to the
   *  "admin" plan with an unlimited cap regardless of any override. */
  isInternal: boolean;
}

/** The override row as the resolver sees it. Shaped to match the DB
 *  column encoding but kept as its own interface so the resolver is
 *  not coupled to Drizzle types. */
export interface PlanOverrideSnapshot {
  planSlug: string | null;
  monthlyTokenLimit: number | null;
  expiresAt: Date | null;
  reason: string;
  grantedBy: string;
  grantedAt: Date;
}

/** The computed effective plan + limit. */
export interface EffectivePlan {
  planSlug: PlanSlug | string;
  planName: string;
  isPaid: boolean;
  isUnlimited: boolean;
  /** Monthly token cap. null = unlimited; otherwise a non-negative integer. */
  monthlyLimit: number | null;
  /** Provenance — tells the UI which source won. */
  source: "internal" | "override" | "subscription" | "default";
  /** True when an override exists AND is currently in force. */
  overrideActive: boolean;
  /** True when an override exists at all (even if expired). Useful for
   *  the "Reset to original" button visibility. */
  overridePresent: boolean;
  /** The override's expiry, if any. Surfaced so the UI can show
   *  "expires May 20, 2026" without re-querying. */
  overrideExpiresAt: Date | null;
}

/** Plan default monthly-token caps. Centralised here so the resolver,
 *  the budget enforcer, and the admin UI all agree. */
export function defaultMonthlyLimitForPlan(slug: string): number | null {
  switch (slug) {
    case "free":
      return FREE_AI_MONTHLY_TOKENS;
    case "pro":
      return PRO_AI_MONTHLY_TOKENS;
    case "unlimited":
    case "admin":
      return null;
    default:
      // Unknown plan slug (e.g. legacy) → conservative default.
      return FREE_AI_MONTHLY_TOKENS;
  }
}

function displayNameForSlug(slug: string): string {
  switch (slug) {
    case "free": return "Free";
    case "pro": return "Pro";
    case "unlimited": return "Unlimited";
    case "admin": return "Admin";
    default: return slug.charAt(0).toUpperCase() + slug.slice(1);
  }
}

/** True when the override row is present AND has not yet expired. */
export function isOverrideActive(
  override: PlanOverrideSnapshot | null,
  now: Date,
): boolean {
  if (!override) return false;
  if (override.expiresAt === null) return true;
  return override.expiresAt.getTime() > now.getTime();
}

/**
 * Compute the effective plan + limit for a user.
 *
 * Precedence:
 *   1. Internal users (SuperAdmin/Admin) → "admin" / unlimited. Overrides
 *      don't apply; staff aren't subject to plan caps.
 *   2. Active override → override.planSlug fills in missing fields from
 *      the subscription; override.monthlyTokenLimit wins over plan default.
 *   3. Subscription → plan + default limit.
 *   4. No subscription → "free" + FREE_AI_MONTHLY_TOKENS.
 */
export function resolveEffectivePlan(
  subscription: SubscriptionSnapshot,
  override: PlanOverrideSnapshot | null,
  now: Date,
): EffectivePlan {
  const overridePresent = override !== null;
  const overrideActive = isOverrideActive(override, now);

  // (1) Internal staff — no caps, always "admin".
  if (subscription.isInternal) {
    return {
      planSlug: "admin",
      planName: "Admin",
      isPaid: false,
      isUnlimited: true,
      monthlyLimit: null,
      source: "internal",
      overrideActive,
      overridePresent,
      overrideExpiresAt: override?.expiresAt ?? null,
    };
  }

  // (2) Active override.
  if (overrideActive && override) {
    // planSlug from override if present; else inherit from subscription.
    const effectiveSlug =
      override.planSlug
      ?? subscription.planSlug
      ?? "free";
    const effectiveName = displayNameForSlug(effectiveSlug);

    // Token limit: explicit override value wins; else plan default.
    let monthlyLimit: number | null;
    if (override.monthlyTokenLimit === null || override.monthlyTokenLimit === undefined) {
      monthlyLimit = defaultMonthlyLimitForPlan(effectiveSlug);
    } else if (override.monthlyTokenLimit === UNLIMITED_TOKEN_LIMIT) {
      monthlyLimit = null;
    } else {
      monthlyLimit = override.monthlyTokenLimit;
    }

    const isUnlimited = monthlyLimit === null;
    const isPaid = effectiveSlug !== "free" || isUnlimited;

    return {
      planSlug: effectiveSlug,
      planName: effectiveName,
      isPaid,
      isUnlimited,
      monthlyLimit,
      source: "override",
      overrideActive: true,
      overridePresent: true,
      overrideExpiresAt: override.expiresAt ?? null,
    };
  }

  // (3) Subscription-backed.
  if (subscription.planSlug) {
    const monthlyLimit = defaultMonthlyLimitForPlan(subscription.planSlug);
    const isUnlimited = monthlyLimit === null;
    const isPaid = subscription.planSlug !== "free" || isUnlimited;
    return {
      planSlug: subscription.planSlug,
      planName: subscription.planName ?? displayNameForSlug(subscription.planSlug),
      isPaid,
      isUnlimited,
      monthlyLimit,
      source: "subscription",
      overrideActive: false,
      overridePresent,
      overrideExpiresAt: override?.expiresAt ?? null,
    };
  }

  // (4) No subscription — default to free.
  return {
    planSlug: "free",
    planName: "Free",
    isPaid: false,
    isUnlimited: false,
    monthlyLimit: FREE_AI_MONTHLY_TOKENS,
    source: "default",
    overrideActive: false,
    overridePresent,
    overrideExpiresAt: override?.expiresAt ?? null,
  };
}
