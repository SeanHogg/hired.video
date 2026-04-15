/**
 * Billing Facade — the ONE entry point tool routes use to reason about
 * a caller's audience. Wraps the raw `getSubscription()` service so the
 * tool layer never touches the billing domain directly (roadmap #150,
 * DDD-boundary finding).
 *
 * The facade exposes two methods:
 *   • `getAudience(user)` — what the AccessPolicy dispatches on.
 *     Returns one of "anonymous" | "free" | "pro" | "admin".
 *   • `getTier(user)` — the actual billing tier ("free" | "pro"),
 *     for routes that need to reason about the plan (e.g., billing
 *     pages) rather than gating behavior.
 *
 * Tool routes should prefer `getAudience`. The separation exists so
 * "there are four tiers" confusion doesn't creep back — tiers are
 * Free / Pro, period; audiences are the wider set the policy needs.
 */

import type { JwtPayload } from "../../types/index.js";
import { getSubscription } from "../../services/billing.js";
import { deriveAudience, deriveTier, type Audience, type Tier } from "./audience.js";

export interface BillingFacade {
  /**
   * Resolve the caller's policy audience from the current auth context.
   * Anonymous callers short-circuit without hitting the billing service.
   */
  getAudience(user: JwtPayload | null | undefined): Promise<Audience>;

  /**
   * Resolve the caller's billing tier. Anonymous users default to
   * "free" since there's no subscription to look up.
   */
  getTier(user: JwtPayload | null | undefined): Promise<Tier>;
}

export const billingFacade: BillingFacade = {
  async getAudience(user) {
    if (!user?.sub) return "anonymous";
    const sub = await getSubscription(user.sub);
    return deriveAudience(user, sub);
  },

  async getTier(user) {
    if (!user?.sub) return "free";
    const sub = await getSubscription(user.sub);
    return deriveTier(sub);
  },
};

/**
 * Build a deterministic test double. Useful for unit tests that want
 * to exercise the access-policy branches without setting up a fake DB.
 *
 * Example:
 *   const fake = makeBillingFacadeForTests({ "user-1": "pro" });
 *   await fake.getAudience({ sub: "user-1" }); // → "pro"
 */
export function makeBillingFacadeForTests(
  audienceByUserId: Record<string, Audience>,
): BillingFacade {
  return {
    async getAudience(user) {
      if (!user?.sub) return "anonymous";
      return audienceByUserId[user.sub] ?? "free";
    },
    async getTier(user) {
      if (!user?.sub) return "free";
      const a = audienceByUserId[user.sub] ?? "free";
      // Admin is a policy concept, not a billing tier — map to the
      // underlying plan (default "free"; tests wanting an admin-on-pro
      // scenario should use the production facade with a mocked sub).
      if (a === "pro") return "pro";
      return "free";
    },
  };
}
