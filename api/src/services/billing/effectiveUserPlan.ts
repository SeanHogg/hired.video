/**
 * effectiveUserPlan — the pure "what plan is this user on / are they Pro?"
 * decision, shared by the single-user cached loader in BillingService
 * (`loadEffectiveUserPlan` → `getSubscription`) and the batch
 * `loadIsProForUsers` below. Both paths feed the SAME inputs (role,
 * active subscription, override row) through the SAME functions, so the
 * single and batch answers cannot drift.
 *
 * Batch path exists because neon-http makes every query a full HTTP
 * round-trip: N × getSubscription on a cold cache was 3N queries; the
 * batch is 2 parallel inArray reads (+ 1 users read when roles aren't
 * already in hand).
 */
import { USER_ROLES } from "../../../../shared/user-roles.js";
import {
  resolveEffectivePlan,
  type EffectivePlan,
  type PlanOverrideSnapshot,
} from "../../domains/planOverride/resolver.js";
import type { PlanOverrideRow } from "../../repositories/subscriptionsRepository.js";
import type { ApiDeps } from "../apiDeps.js";
import { defaultApiDeps } from "../apiDeps.js";

/** Internal staff (SuperAdmin / Admin) always resolve to the admin plan. */
export function isInternalRole(role: string | null | undefined): boolean {
  return role === USER_ROLES.SUPER_ADMIN || role === USER_ROLES.ADMIN;
}

/** Project a DB override row into the resolver's snapshot shape. */
export function toOverrideSnapshot(row: PlanOverrideRow | null | undefined): PlanOverrideSnapshot | null {
  if (!row) return null;
  return {
    planSlug: row.planSlug ?? null,
    monthlyTokenLimit: row.monthlyTokenLimit ?? null,
    expiresAt: row.expiresAt ?? null,
    reason: row.reason,
    grantedBy: row.grantedBy,
    grantedAt: row.grantedAt,
  };
}

/** The resolver inputs every plan lookup gathers, single or batch. */
export interface UserPlanInputs {
  role: string | null | undefined;
  subscription: { planSlug: string | null; planName: string | null } | null;
  override: PlanOverrideRow | null | undefined;
}

/** Pure: role + active subscription + override → effective plan. */
export function resolveUserEffectivePlan(inputs: UserPlanInputs, now: Date): EffectivePlan {
  // A subscription on `trialing` that hasn't elapsed counts as paid; the
  // resolver only sees plan slug + role, so the trialing carve-out lives
  // in `computeIsPro`. (Trial subs always have a non-free plan slug in
  // this schema, so no slug surgery is needed.)
  return resolveEffectivePlan(
    {
      planSlug: inputs.subscription?.planSlug ?? null,
      planName: inputs.subscription?.planName ?? null,
      isInternal: isInternalRole(inputs.role),
    },
    toOverrideSnapshot(inputs.override),
    now,
  );
}

/** `isPro` legacy meaning: any paid tier OR an active trial OR an active
 *  override that grants a paid plan / unlimited tokens. */
export function computeIsPro(effective: EffectivePlan, subscriptionStatus: string | null | undefined): boolean {
  return effective.isPaid || subscriptionStatus === "trialing";
}

type PlanRepos = Pick<ApiDeps["repos"], "subscriptions" | "users">;

/**
 * Batch isPro for users whose role is already known. Two parallel
 * inArray reads (active subscriptions + overrides) regardless of count.
 */
export async function resolveIsProForUsers(
  usersWithRoles: ReadonlyArray<{ id: string; role: string | null | undefined }>,
  repos: Pick<PlanRepos, "subscriptions"> = defaultApiDeps().repos,
  now: Date = new Date(),
): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>();
  if (usersWithRoles.length === 0) return out;
  const ids = Array.from(new Set(usersWithRoles.map((u) => u.id)));

  const [subRows, overrideRows] = await Promise.all([
    repos.subscriptions.findActiveByUserIds(ids),
    repos.subscriptions.findOverridesByUserIds(ids),
  ]);

  // Mirror the single-user `.limit(1)`: first active row per user wins.
  const subByUser = new Map<string, (typeof subRows)[number]>();
  for (const s of subRows) if (!subByUser.has(s.userId)) subByUser.set(s.userId, s);
  const overrideByUser = new Map<string, PlanOverrideRow>();
  for (const o of overrideRows) if (!overrideByUser.has(o.userId)) overrideByUser.set(o.userId, o);

  for (const u of usersWithRoles) {
    const sub = subByUser.get(u.id) ?? null;
    const effective = resolveUserEffectivePlan(
      { role: u.role, subscription: sub, override: overrideByUser.get(u.id) ?? null },
      now,
    );
    out.set(u.id, computeIsPro(effective, sub?.status));
  }
  return out;
}

/** Batch isPro by id — one users read for roles, then `resolveIsProForUsers`.
 *  Unknown ids resolve with a null role (same as the single-user loader). */
export async function loadIsProForUsers(
  userIds: readonly string[],
  repos: PlanRepos = defaultApiDeps().repos,
  now: Date = new Date(),
): Promise<Map<string, boolean>> {
  const ids = Array.from(new Set(userIds));
  if (ids.length === 0) return new Map();
  const rows = await repos.users.findManyByIds(ids);
  const roleById = new Map(rows.map((r) => [r.id, r.role]));
  return resolveIsProForUsers(
    ids.map((id) => ({ id, role: roleById.get(id) ?? null })),
    repos,
    now,
  );
}
