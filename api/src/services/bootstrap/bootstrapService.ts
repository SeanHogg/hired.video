/**
 * /api/bootstrap aggregate (gaps #1367/#1368, W1-C) — everything the SPA
 * needs on first paint for a signed-in viewer, in ONE round-trip. Every
 * slice runs in parallel under allSettled: a failing slice comes back null
 * and the client's per-slice hook falls back to its own endpoint.
 *
 * Each slice is the SAME service call its standalone route makes, so the
 * seeded client caches hold byte-identical payloads:
 *   verification      ← GET /api/auth/verification-status
 *   tokenBudget       ← GET /api/billing/token-budget
 *   subscription      ← GET /api/billing/subscription
 *   roleAccess        ← GET /api/role-access/me
 *   points            ← GET /api/points/me          (scoring roles only)
 *   accountsAvailable ← GET /api/account/available  ({ result } unwrapped)
 *   impersonation     ← GET /api/admin/impersonate/active (SuperAdmin only)
 *   inboxSummary      ← GET /api/inbox (unfiltered)
 */

import { getDb } from "../../db/index.js";
import { buildRepos } from "../../repositories/index.js";
import * as billingService from "../billing/BillingService.js";
import { getCachedInbox } from "../messaging/inboxCache.js";
import { RoleAccessService } from "../admin/RoleAccessService.js";
import { getAvailableAccounts } from "../user/account.js";
import { getActiveSession } from "../auth/impersonation.js";
import type { GamificationService } from "../../domains/gamification/index.js";
import { resolveAccessRole } from "../../../../shared/role-access.js";
import { USER_ROLES } from "../../../../shared/user-roles.js";

/** Same set the SPA's isPointsEligible gate uses — other roles never read it. */
const POINTS_ROLES: ReadonlySet<string> = new Set([
  USER_ROLES.JOB_SEEKER,
  USER_ROLES.RECRUITER,
  USER_ROLES.EMPLOYER,
]);

export interface BootstrapViewer {
  userId: string;
  roles: string[];
  isSuperAdmin: boolean;
}

export interface BootstrapDeps {
  gamification: () => GamificationService;
}

function settled<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === "fulfilled" ? (result.value ?? null) : null;
}

export async function buildBootstrap(viewer: BootstrapViewer, deps: BootstrapDeps) {
  const repos = buildRepos(getDb());
  const { userId, roles } = viewer;
  const accessRole = resolveAccessRole(roles);
  const primaryRole = roles[0] ?? "";

  const [
    verification,
    tokenBudget,
    subscription,
    roleOverrides,
    points,
    accountsAvailable,
    impersonation,
    inboxSummary,
  ] = await Promise.allSettled([
    repos.users.findVerificationStatus(userId),
    billingService.buildTokenBudgetDTO(userId),
    billingService.getSubscription(userId),
    new RoleAccessService(repos.roleFeatureAccess).getOverridesForRole(accessRole),
    POINTS_ROLES.has(primaryRole) ? deps.gamification().getUserSummary(userId) : Promise.resolve(null),
    getAvailableAccounts(userId, primaryRole),
    viewer.isSuperAdmin ? getActiveSession(userId) : Promise.resolve(null),
    getCachedInbox({ repos }, userId, {}),
  ]);

  const verificationRow = settled(verification);
  const overrides = settled(roleOverrides);

  return {
    verification: verificationRow
      ? {
          email: verificationRow.email,
          emailConfirmed: !!verificationRow.emailVerified,
          // Matches /api/auth/verification-status — request time stands in
          // for "last sent" (the client's localStorage holds the cooldown).
          sentAt: new Date().toISOString(),
        }
      : null,
    tokenBudget: settled(tokenBudget),
    subscription: settled(subscription),
    roleAccess: overrides ? { role: accessRole, overrides } : null,
    points: settled(points),
    accountsAvailable: settled(accountsAvailable),
    impersonation: viewer.isSuperAdmin ? { active: settled(impersonation) } : null,
    inboxSummary: settled(inboxSummary),
    // One trusted clock for drift-aware "ago" labels.
    serverTime: new Date().toISOString(),
  };
}

export type BootstrapPayloadDTO = Awaited<ReturnType<typeof buildBootstrap>>;
