/**
 * Billing Facade — the ONE entry point tool routes use to reason about
 * a caller's tier. Wraps the raw `getSubscription()` service so the
 * tool layer never touches the billing domain directly (roadmap #150,
 * DDD-boundary finding).
 *
 * Before this file existed, `resume-scorer.ts` called
 * `getSubscription(userId)` and inspected `sub.isPremium` — a bounded
 * context leak that made "add a Team tier" a codebase-wide sweep.
 *
 * The facade is intentionally tiny. It exists so:
 *   1. Tool routes have a stable, mockable dependency.
 *   2. The `isPremium → tier` translation lives in one place
 *      (`deriveTier`), so pricing changes don't ripple through routes.
 */

import type { JwtPayload } from "../../types/index.js";
import { getSubscription } from "../../services/billing.js";
import { deriveTier, type Tier } from "./tier.js";

export interface BillingFacade {
  /**
   * Resolve the caller's tier from the current auth context.
   *
   * Implementation looks up the subscription via `getSubscription()`
   * for authenticated users; anonymous callers short-circuit to
   * `"anonymous"` without hitting the billing service.
   */
  getTier(user: JwtPayload | null | undefined): Promise<Tier>;
}

/**
 * Production facade. Uses the cached `getSubscription()` service.
 */
export const billingFacade: BillingFacade = {
  async getTier(user) {
    if (!user?.sub) return "anonymous";
    const sub = await getSubscription(user.sub);
    return deriveTier(user, sub);
  },
};

/**
 * Build a deterministic test double for the facade. Useful for unit
 * tests that want to exercise the tier-policy branches without setting
 * up a fake database.
 *
 * Example:
 *   const fake = makeBillingFacadeForTests({ "user-1": "pro" });
 *   await fake.getTier({ sub: "user-1" }); // → "pro"
 */
export function makeBillingFacadeForTests(
  tierByUserId: Record<string, Tier>,
): BillingFacade {
  return {
    async getTier(user) {
      if (!user?.sub) return "anonymous";
      return tierByUserId[user.sub] ?? "free";
    },
  };
}
