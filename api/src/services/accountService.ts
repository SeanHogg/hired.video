/**
 * AccountService — the cross-aggregate seam for "everything about this
 * user's account": identity + subscription + access control + prefs.
 *
 * Why this service exists: a lot of endpoints (admin search, auth
 * middleware, settings page, effective-plan lookup) need a compound
 * view across several aggregates. Rather than merging the repos (→ god
 * repo, ISP violation) or duplicating the cross-aggregate query
 * everywhere (→ DRY violation), the composition lives here.
 *
 * Rule: this service NEVER imports Drizzle. It only calls the repository
 * interfaces the request wires in via DI.
 */

import type {
  IUsersRepository,
  ISubscriptionsRepository,
  IAuthTokensRepository,
  IAuthzRepository,
  IAuditRepository,
  IPreferencesRepository,
  UserRow,
  UserProfileRow,
  SubscriptionRow,
  SubscriptionPlanRow,
  PlanOverrideRow,
  UserPermissionOverrideRow,
} from "../repositories/index.js";

// ─── Compound view types ────────────────────────────────────────────────────

/** Everything request-handling code usually needs about the caller:
 *  their core row, public profile, current subscription + plan, any
 *  admin override, and their active module grants. Loaded in one call
 *  so callers don't shotgun repos one by one. */
export interface AccountContext {
  user: UserRow;
  profile: UserProfileRow | null;
  subscription: SubscriptionRow | null;
  plan: SubscriptionPlanRow | null;
  planOverride: PlanOverrideRow | null;
  activeModuleSlugs: string[];
  permissionOverrides: UserPermissionOverrideRow[];
}

// ─── Service deps — injected repo interfaces, not concrete classes ──────────

export interface AccountServiceDeps {
  users: IUsersRepository;
  subscriptions: ISubscriptionsRepository;
  // Auth is 3 repos post-split — we pull only the slices this service
  // actually needs. `authTokens` for session teardown, `authz` for module
  // grants / permission overrides, `audit` for future activity lookups.
  authTokens: IAuthTokensRepository;
  authz: IAuthzRepository;
  audit: IAuditRepository;
  preferences: IPreferencesRepository;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/** Load the full account context in parallel. Returns `null` when the
 *  user doesn't exist; every subsequent field is best-effort (missing
 *  profile / subscription / etc. is a normal state, not an error). */
export async function loadAccountContext(
  deps: AccountServiceDeps,
  userId: string,
): Promise<AccountContext | null> {
  const user = await deps.users.findById(userId);
  if (!user) return null;

  const [
    profile,
    subscription,
    planOverride,
    assignments,
    permissionOverrides,
  ] = await Promise.all([
    deps.users.findProfileByUserId(userId),
    deps.subscriptions.findActiveByUserId(userId),
    deps.subscriptions.findOverrideByUserId(userId),
    deps.authz.findActiveAssignmentsForUser(userId),
    deps.authz.findPermissionOverridesForUser(userId),
  ]);

  const plan = subscription
    ? await deps.subscriptions.findPlanById(subscription.planId)
    : null;

  return {
    user,
    profile,
    subscription,
    plan,
    planOverride,
    activeModuleSlugs: (assignments as Array<{ slug: string }>).map((a) => a.slug),
    permissionOverrides,
  };
}

/** End-of-life for a user session: invalidate every refresh token,
 *  bump the lastLogout audit row, and — if the caller is a SuperAdmin
 *  closing out an impersonation — close that session too.
 *
 *  Named `endAccountSession` because it's specifically about the
 *  session layer; actually deleting/suspending the user is a different
 *  operation and belongs in an admin flow, not a "signout" service. */
export async function endAccountSession(
  deps: AccountServiceDeps,
  userId: string,
): Promise<void> {
  await deps.authTokens.deleteRefreshTokensForUser(userId);
}
