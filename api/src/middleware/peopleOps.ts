/**
 * peopleOpsContext — the single gate every /api/people/* route runs behind.
 * It enforces the two invariants of the embeddable CHRO product, in order:
 *
 *   1. Segment resolution (no-bleed): map the caller → (tenantId, segmentId)
 *      via resolveSegment(). No handler ever runs without this scope.
 *   2. Paid entitlement: the CHRO suite is 100% paid. The company must have
 *      an active plan (Admin / SuperAdmin bypass for support).
 *
 * On success it stashes the resolved scope on `c.var.peopleCtx`; handlers
 * read it instead of re-deriving the company, so the (tenant, segment)
 * filter is impossible to forget.
 */

import type { MiddlewareHandler } from "hono";
import type { AppEnv, Variables } from "../types/index.js";
import { error } from "../types/index.js";
import { isAdminRole } from "./superAdmin.js";
import { UPGRADE_URL } from "../../../shared/tier-copy.js";
import {
  resolveSegment,
  SegmentResolutionError,
  type PeopleSegmentScope,
} from "../services/people-ops/segment.js";
import { companyHasActivePlan, isPaidSegmentPlan } from "../services/people-ops/entitlement.js";

/** Variables added to the context once peopleOpsContext has run. */
export interface PeopleVariables extends Variables {
  peopleCtx: PeopleSegmentScope & { isAdmin: boolean };
}

export type PeopleEnv = { Bindings: AppEnv["Bindings"]; Variables: PeopleVariables };

export const peopleOpsContext: MiddlewareHandler<PeopleEnv> = async (c, next) => {
  const userId = c.var.user?.sub;
  if (!userId) {
    return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  }

  // 1. Resolve the segment (lazy-provision on first sight).
  const explicitCompanyId = c.req.query("companyId") ?? null;
  let scope: PeopleSegmentScope;
  try {
    scope = await resolveSegment(userId, explicitCompanyId);
  } catch (e) {
    if (e instanceof SegmentResolutionError) {
      const status = e.code === "FORBIDDEN" ? 403 : 400;
      return c.json(error(e.code, e.message), status as 400 | 403);
    }
    throw e;
  }

  // 2. Paid entitlement — the CHRO suite is 100% paid.
  const isAdmin = isAdminRole(c.var.user);
  if (!isAdmin) {
    const entitled = isPaidSegmentPlan(scope.plan) || (await companyHasActivePlan(scope.companyId));
    if (!entitled) {
      return c.json(
        {
          success: false as const,
          error: {
            code: "PEOPLE_OPS_UPGRADE_REQUIRED",
            message:
              "People Operations is a paid employer feature. Upgrade your company plan to manage your roster, org chart, and 1:1s.",
            upgradeUrl: UPGRADE_URL,
          },
          timestamp: new Date().toISOString(),
        },
        402,
      );
    }
  }

  c.set("peopleCtx", { ...scope, isAdmin });
  return next();
};
