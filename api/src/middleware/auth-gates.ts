/**
 * Pro / role-based route gates.
 *
 * `requirePro(featureName)` is the building block — every billable
 * feature mounts it on its route. Pre-baked named gates live below it
 * for any feature that's checked from more than one route file (so the
 * pricing-copy "Video Analytics" name lives in exactly one place).
 *
 * Other middleware concerns (token-budget metering, per-period entitlement
 * gates) live in sibling modules:
 *   - `middleware/token-budget.ts`        (checkTokenBudget, attachTokenBudget…)
 *   - `domains/services-processing/services-processor.ts`  (servicesProcessor.enforce / meterEvent — every catalog-declared dimension)
 */

import type { Context, MiddlewareHandler } from "hono";
import type { Variables } from "../types/index.js";
import { getSubscription } from "../services/billing/BillingService.js";
import { USER_ROLES } from "../../../shared/user-roles.js";
import { TIER_COPY, UPGRADE_URL } from "../../../shared/tier-copy.js";

type AppCtx = Context<AppEnv>;

/**
 * `requirePro("Salary Calculator")` — returns 402 for non-pro
 * callers with the canonical PRO_REQUIRED envelope. Admin /
 * SuperAdmin roles bypass.
 */
export function requirePro(featureName: string): MiddlewareHandler<AppEnv> {
  return async (c: AppCtx, next) => {
    const userId = c.var.user?.sub;
    if (!userId) {
      return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } }, 401);
    }

    const roles = c.var.user?.roles ?? [];
    const role = (c.var.user as any)?.role ?? "";
    if (
      roles.includes(USER_ROLES.SUPER_ADMIN) ||
      roles.includes(USER_ROLES.ADMIN) ||
      role === USER_ROLES.SUPER_ADMIN ||
      role === USER_ROLES.ADMIN
    ) {
      return next();
    }

    const sub = await getSubscription(userId);
    if (!sub.isPro) {
      return c.json(
        {
          success: false,
          error: {
            // Stable envelope code — frontend hooks pattern-match on it.
            // Internal "Pro" terminology is preserved here while the
            // human-readable copy comes from `shared/tier-copy.ts`.
            code: "PRO_REQUIRED",
            message: TIER_COPY.proFeatureRequired(featureName),
            upgradeUrl: UPGRADE_URL,
          },
        },
        402,
      );
    }
    return next();
  };
}

// ---------------------------------------------------------------------------
// Named pro gates — one source of truth for feature names that are
// referenced from more than one route file.
// ---------------------------------------------------------------------------

/** Heatmap (`studio-features.ts /analytics/projects/:projectId`) AND
 *  CTA-clicks / share counts (`studio.ts /projects/:id/analytics`) gate
 *  together. Re-keyed from videoId → projectId in migration 0085. */
export const requireVideoAnalytics = requirePro("Video Analytics");
