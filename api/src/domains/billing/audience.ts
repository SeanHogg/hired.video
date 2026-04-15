/**
 * Tier vs. Audience — two distinct concepts.
 *
 *   Tier      = "free" | "pro"
 *               The billing domain. This is what Pricing.tsx sells, what
 *               Stripe meters, and what `sub.isPremium` reflects. Only
 *               two values exist, period.
 *
 *   Audience  = "anonymous" | "free" | "pro" | "admin"
 *               What the AccessPolicy dispatches on. Broader than Tier
 *               because the policy has to treat signed-out visitors and
 *               internal admins differently:
 *                 - Anonymous → locked upsell (prompt to sign up)
 *                 - Free      → teaser (prompt to upgrade)
 *                 - Pro       → full response
 *                 - Admin     → full response, bypasses token budget
 *
 * Keeping these separate prevents the "there are four tiers" confusion
 * (roadmap #150 follow-up). Tool routes care about Audience; billing
 * and Stripe care about Tier.
 */

import type { SubscriptionSummaryDTO } from "../../../../shared/billing.js";
import type { JwtPayload } from "../../types/index.js";

/** The actual billing tiers the platform sells. */
export type Tier = "free" | "pro";

/** Policy dispatch — who is calling and how should we respond? */
export type Audience = "anonymous" | "free" | "pro" | "admin";

/**
 * Roles that bypass gating entirely. SuperAdmin and Admin users are
 * internal — they always get the full experience regardless of billing
 * state, matching the behavior in `checkTokenBudget` and `requirePremium`.
 */
export function isAdminRole(user: JwtPayload | null | undefined): boolean {
  if (!user) return false;
  const roles = user.roles ?? [];
  const role = (user as any).role ?? "";
  return (
    roles.includes("SuperAdmin") ||
    roles.includes("Admin") ||
    role === "SuperAdmin" ||
    role === "Admin" ||
    user.isSuperAdmin === true
  );
}

/**
 * Derive the caller's audience from the auth context and billing DTO.
 * This is the single translation point between billing state and
 * policy input; tool routes must never inspect `sub.isPremium` directly.
 *
 * Precedence:
 *   1. No user           → "anonymous"
 *   2. Admin/SuperAdmin  → "admin"   (regardless of billing)
 *   3. sub.isPremium     → "pro"
 *   4. Otherwise         → "free"
 */
export function deriveAudience(
  user: JwtPayload | null | undefined,
  sub: SubscriptionSummaryDTO | null | undefined,
): Audience {
  if (!user) return "anonymous";
  if (isAdminRole(user)) return "admin";
  if (sub?.isPremium) return "pro";
  return "free";
}

/**
 * Extract the billing tier from a subscription DTO. Anonymous callers
 * and users without a subscription record default to `"free"` — matches
 * the behavior of `getSubscription()`, which synthesizes a free-tier
 * summary for first-time callers.
 */
export function deriveTier(
  sub: SubscriptionSummaryDTO | null | undefined,
): Tier {
  return sub?.isPremium ? "pro" : "free";
}
