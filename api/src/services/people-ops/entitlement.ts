/**
 * People-Ops entitlement — the CHRO suite is 100% paid. A company is
 * entitled when it has an active company subscription (any tier). The
 * resolved segment's `plan` mirrors this so the frontend can gate UI
 * without a second round-trip. Admin / SuperAdmin bypass for support.
 *
 * Kept separate from the middleware so it's unit-testable with a fake db.
 */

import { and, eq } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";

export interface EntitlementDeps {
  db: ReturnType<typeof getDb>;
}

const defaultDeps = (): EntitlementDeps => ({ db: getDb() });

/** Plans that count as "paid" on a segment (mirrors the host plan). */
const PAID_SEGMENT_PLANS = new Set(["starter", "team", "pro", "enterprise"]);

export function isPaidSegmentPlan(plan: string | null | undefined): boolean {
  return PAID_SEGMENT_PLANS.has((plan ?? "").toLowerCase());
}

/**
 * True when the company has an active company subscription — the paid gate
 * for People Operations.
 */
export async function companyHasActivePlan(
  companyId: string,
  deps: EntitlementDeps = defaultDeps(),
): Promise<boolean> {
  const [row] = await deps.db
    .select({ status: schema.companySubscriptions.status })
    .from(schema.companySubscriptions)
    .where(
      and(
        eq(schema.companySubscriptions.companyId, companyId),
        eq(schema.companySubscriptions.status, "active"),
      ),
    )
    .limit(1);
  return Boolean(row);
}
