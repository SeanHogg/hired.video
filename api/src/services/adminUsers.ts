import { and, count, desc, eq, gte, ilike, inArray, lt, or, sql, sum, type SQL } from "drizzle-orm";
import { isDeepStrictEqual } from "node:util";
import { getDb, schema } from "../db/index.js";
import { AUDIT_ACTIONS } from "../utils/audit.js";
import {
  type ApiDeps,
  defaultApiDeps,
} from "./apiDeps.js";
import {
  healAndValidateContent,
  type ResumeContentIssue,
} from "./resume/content.js";
import {
  resolveEffectivePlan,
  type PlanOverrideSnapshot,
  type SubscriptionSnapshot,
} from "../domains/planOverride/resolver.js";
import { USER_ROLES } from "../../../shared/user-roles.js";
import { reclaimVideoR2 } from "./storage/reclaim-video-r2.js";

/** Deps this module actually needs. Services declare a narrow `Pick<ApiDeps, …>`
 *  so tests mock only the surface the function touches (ISP). Production
 *  callers pass nothing — `defaultApiDeps()` fills in the real adapters. */
export type AdminUsersDeps = Pick<ApiDeps, "repos" | "email" | "audit" | "now" | "randomHex">;

// ── User search / detail ──────────────────────────────────────────────────────

export interface UserSearchParams {
  page?: number;
  limit?: number;
  search?: string;
  role?: string;
  // "banned" filters IN banned users (otherwise they're excluded from the
  // default list — that's the point of a ban). "active"/"suspended"
  // implicitly exclude banned.
  status?: "active" | "suspended" | "banned";
  // When true, restrict the list to editorial / house authors
  // (users.is_system = true). These are the first-party authors whose
  // content renders as "Editorial" rather than community UGC.
  editorial?: boolean;
}

interface RawPlanOverrideRow {
  userId: string;
  planSlug: string | null;
  monthlyTokenLimit: number | null;
  expiresAt: Date | null;
  reason: string;
  grantedBy: string;
  grantedAt: Date;
}

/**
 * Load the admin-applied plan overrides for a batch of users.
 *
 * Graceful-degradation contract: this is an *optional enrichment* on top of
 * the user list. If the `user_plan_overrides` table is missing (pending
 * migration), the query throws, or anything else goes wrong, we log and
 * return an empty array — the caller treats every user as "no override",
 * which is the same result as if no SuperAdmin had ever set one. A
 * missing sidecar must never take down the whole /admin/users page.
 */
async function loadPlanOverridesForUsers(
  db: ReturnType<typeof getDb>,
  userIds: string[],
): Promise<RawPlanOverrideRow[]> {
  if (userIds.length === 0) return [];
  try {
    return await db
      .select({
        userId: schema.userPlanOverrides.userId,
        planSlug: schema.userPlanOverrides.planSlug,
        monthlyTokenLimit: schema.userPlanOverrides.monthlyTokenLimit,
        expiresAt: schema.userPlanOverrides.expiresAt,
        reason: schema.userPlanOverrides.reason,
        grantedBy: schema.userPlanOverrides.grantedBy,
        grantedAt: schema.userPlanOverrides.grantedAt,
      })
      .from(schema.userPlanOverrides)
      .where(inArray(schema.userPlanOverrides.userId, userIds));
  } catch (err) {
    console.error(
      "[adminUsers] Failed to load plan overrides; degrading to no-override view:",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

export async function searchUsers(
  { page = 1, limit = 50, search, role, status, editorial }: UserSearchParams,
  deps: AdminUsersDeps = defaultApiDeps(),
) {
  // One residual direct-db call remains for toolRuns analytics below —
  // the rest of this function composes repo slices exposed via `deps`.
  const db = getDb();
  const safeLimit = Math.min(limit, 100);
  const offset = (page - 1) * safeLimit;

  const conditions: SQL[] = [];
  if (search) conditions.push(or(ilike(schema.users.email, `%${search}%`), ilike(schema.users.name, `%${search}%`)));
  if (role) conditions.push(eq(schema.users.role, role));
  if (editorial) conditions.push(eq(schema.users.isSystem, true));
  if (status === "active") conditions.push(eq(schema.users.isActive, true));
  if (status === "suspended") conditions.push(eq(schema.users.isSuspended, true));
  // Ban = hidden by default. Banned users only surface when the admin
  // explicitly filters for them (so they can be unbanned / inspected).
  if (status === "banned") {
    conditions.push(eq(schema.users.isBanned, true));
  } else {
    conditions.push(eq(schema.users.isBanned, false));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [users, [{ total }]] = await Promise.all([
    db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
        role: schema.users.role,
        isActive: schema.users.isActive,
        isSuspended: schema.users.isSuspended,
        isBanned: schema.users.isBanned,
        isSuperAdmin: schema.users.isSuperAdmin,
        isSystem: schema.users.isSystem,
        mfaEnabled: schema.users.mfaEnabled,
        createdAt: schema.users.createdAt,
        lastLoginAt: schema.users.lastLoginAt,
      })
      .from(schema.users)
      .where(where)
      .orderBy(desc(schema.users.createdAt))
      .limit(safeLimit)
      .offset(offset),
    db.select({ total: count() }).from(schema.users).where(where),
  ]);

  const userIds = users.map((u) => u.id);
  const now = new Date();
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const [subRows, usageRows, balanceRows, toolRunRows, overrideRows, resumeCountRows] = await Promise.all([
    // Active/trialing subscriptions joined with their plan row.
    deps.repos.subscriptions.findActiveByUserIds(userIds),
    // Monthly token burn in the current billing window.
    deps.repos.tokens.monthlyUsedByUsers(userIds, periodStart, periodEnd),
    // Purchased-pack balance per user (non-monthly tokens that roll over).
    deps.repos.tokens.findBalancesByUserIds(userIds),
    // Tool-run tallies drive the "Tools used" column on /admin/users so
    // ops can see who's actually engaging with the AI tools at a glance.
    // toolRuns lives in the audit-adjacent bucket — no repo yet; kept as
    // a direct query until the tool-runs repo lands.
    userIds.length === 0
      ? Promise.resolve([] as Array<{ userId: string; runs: number; tokens: number | null }>)
      : db
          .select({
            userId: schema.toolRuns.userId,
            runs: sql<number>`count(*)::int`,
            tokens: sum(schema.toolRuns.tokensUsed),
          })
          .from(schema.toolRuns)
          .where(inArray(schema.toolRuns.userId, userIds))
          .groupBy(schema.toolRuns.userId),
    // Per-user plan overrides (SuperAdmin comp / trial / custom limits).
    // Optional enrichment — degrades to [] on any failure (see loader).
    loadPlanOverridesForUsers(db, userIds),
    // Resume counts drive the "Resumes" column.
    deps.repos.resumes.countByOwnerBulk(userIds),
  ]);

  const subByUser = new Map(subRows.map((r) => [r.userId, r]));
  const usedByUser = new Map(usageRows.map((r) => [r.userId, Number(r.used ?? 0)]));
  const packByUser = new Map(balanceRows.map((r) => [r.userId, r.balance]));
  const toolRunsByUser = new Map<string, { runs: number; tokens: number }>(
    toolRunRows.map((r) => [r.userId, { runs: r.runs, tokens: Number(r.tokens ?? 0) }] as const),
  );
  const resumeCountByUser = resumeCountRows;
  const overrideByUser = new Map<string, PlanOverrideSnapshot>(
    overrideRows.map((r) => [r.userId, {
      planSlug: r.planSlug ?? null,
      monthlyTokenLimit: r.monthlyTokenLimit ?? null,
      expiresAt: r.expiresAt ?? null,
      reason: r.reason,
      grantedBy: r.grantedBy,
      grantedAt: r.grantedAt,
    } satisfies PlanOverrideSnapshot]),
  );

  const enriched = users.map((u) => {
    const sub = subByUser.get(u.id);
    const isInternal = u.isSuperAdmin || u.role === USER_ROLES.SUPER_ADMIN || u.role === USER_ROLES.ADMIN;
    const subscription: SubscriptionSnapshot = {
      planSlug: sub?.planSlug ?? null,
      planName: sub?.planName ?? null,
      isInternal,
    };
    const override = overrideByUser.get(u.id) ?? null;
    // The same `now` used above for the usage period window drives the
    // override expiry check, so the row we serve is internally consistent.
    const effective = resolveEffectivePlan(subscription, override, now);

    const monthlyUsed = usedByUser.get(u.id) ?? 0;
    const packBalance = packByUser.get(u.id) ?? 0;
    const monthlyRemaining = effective.monthlyLimit === null
      ? null
      : Math.max(0, effective.monthlyLimit - monthlyUsed);
    const tokensAvailable = effective.monthlyLimit === null
      ? null
      : (monthlyRemaining ?? 0) + packBalance;
    const toolStats = toolRunsByUser.get(u.id);
    return {
      ...u,
      planId: effective.planSlug,
      planName: effective.planName,
      isPaid: effective.isPaid,
      isUnlimited: effective.isUnlimited,
      monthlyLimit: effective.monthlyLimit,
      monthlyUsed,
      packBalance,
      tokensAvailable,
      toolRunCount: toolStats?.runs ?? 0,
      toolTokensUsed: toolStats?.tokens ?? 0,
      resumeCount: resumeCountByUser.get(u.id) ?? 0,
      // Override provenance — the /admin/users UI renders a badge when
      // the effective plan comes from an override so ops can tell at a
      // glance why a user sees a non-default plan/limit.
      planOverride: override
        ? {
            active: effective.overrideActive,
            planSlug: override.planSlug,
            monthlyTokenLimit: override.monthlyTokenLimit,
            expiresAt: override.expiresAt?.toISOString() ?? null,
            reason: override.reason,
            grantedBy: override.grantedBy,
            grantedAt: override.grantedAt.toISOString(),
            // The original plan is what they'd revert to (subscription-backed).
            originalPlanSlug: subscription.planSlug ?? "free",
            originalPlanName: subscription.planName ?? "Free",
          }
        : null,
    };
  });

  return { users: enriched, total, page, limit: safeLimit };
}

export async function getUserDetail(userId: string) {
  const db = getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  if (!user) return null;

  const [recentSessions, moduleAssignments, permissionOverrides] = await Promise.all([
    db
      .select({
        id: schema.impersonationSessions.id,
        superAdminId: schema.impersonationSessions.superAdminId,
        startedAt: schema.impersonationSessions.startedAt,
        endedAt: schema.impersonationSessions.endedAt,
        endReason: schema.impersonationSessions.endReason,
      })
      .from(schema.impersonationSessions)
      .where(eq(schema.impersonationSessions.targetUserId, userId))
      .orderBy(desc(schema.impersonationSessions.startedAt))
      .limit(10),
    db
      .select({
        id: schema.userModuleAssignments.id,
        moduleId: schema.userModuleAssignments.moduleId,
        assignedAt: schema.userModuleAssignments.assignedAt,
        revokedAt: schema.userModuleAssignments.revokedAt,
        name: schema.modules.name,
        slug: schema.modules.slug,
      })
      .from(schema.userModuleAssignments)
      .innerJoin(schema.modules, eq(schema.userModuleAssignments.moduleId, schema.modules.id))
      .where(eq(schema.userModuleAssignments.userId, userId)),
    db.select().from(schema.userPermissionOverrides).where(eq(schema.userPermissionOverrides.userId, userId)),
  ]);

  const { passwordHash, mfaSecret, ...safeUser } = user;
  return { user: safeUser, recentSessions, moduleAssignments, permissionOverrides };
}

// ── Role / status changes ─────────────────────────────────────────────────────

export async function assignUserRole(
  adminId: string,
  userId: string,
  role: string,
  deps: AdminUsersDeps = defaultApiDeps(),
): Promise<{ ok: true } | { ok: false; code: "NOT_FOUND" }> {
  const existing = await deps.repos.users.findById(userId);
  if (!existing) return { ok: false, code: "NOT_FOUND" };

  await deps.repos.users.updateById(userId, { role });

  await deps.audit.log({
    actorId: adminId,
    action: AUDIT_ACTIONS.USER_ROLE_CHANGED,
    targetType: "user",
    targetId: userId,
    metadata: { fromRole: existing.role, toRole: role },
  });

  return { ok: true };
}

/**
 * Admin-initiated password reset: invalidates any outstanding reset tokens,
 * issues a fresh one (1h TTL), and emails it to the user. Mirrors the
 * self-serve /auth/forgot-password flow but is driven by a SuperAdmin and
 * returns structured errors instead of the enumeration-safe always-success.
 */
export async function sendUserPasswordReset(
  adminId: string,
  userId: string,
  deps: AdminUsersDeps = defaultApiDeps(),
): Promise<
  | { ok: true; email: string }
  | { ok: false; code: "NOT_FOUND" }
> {
  const user = await deps.repos.users.findById(userId);
  if (!user) return { ok: false, code: "NOT_FOUND" };

  const token = deps.randomHex(32);
  const expiresAt = new Date(deps.now().getTime() + 60 * 60 * 1000);

  await deps.repos.authTokens.invalidatePasswordResetsForUser(user.id);
  await deps.repos.authTokens.insertPasswordResetToken({
    userId: user.id,
    token,
    expiresAt,
  } as any);

  await deps.email.sendPasswordReset(user.email, user.name, token);

  await deps.audit.log({
    actorId: adminId,
    action: AUDIT_ACTIONS.PASSWORD_RESET_SENT,
    targetType: "user",
    targetId: userId,
    metadata: { email: user.email },
  });

  return { ok: true, email: user.email };
}

export async function setUserStatus(
  adminId: string,
  userId: string,
  status: "active" | "suspended",
  deps: AdminUsersDeps = defaultApiDeps(),
): Promise<void> {
  // Reactivating also clears a ban — the /admin/users "Reactivate" action
  // needs to be the single escape hatch for both suspended and banned
  // states, otherwise a banned user would be stuck invisible forever.
  await deps.repos.users.updateById(userId, {
    isSuspended: status === "suspended",
    isActive: status === "active",
    ...(status === "active" ? { isBanned: false } : {}),
  });

  await deps.audit.log({
    actorId: adminId,
    action: AUDIT_ACTIONS.USER_STATUS_CHANGED,
    targetType: "user",
    targetId: userId,
    metadata: { status },
  });
}

/**
 * Toggle a user's `is_system` flag — marks them as an editorial / house
 * author whose content renders as first-party "Editorial" rather than
 * community UGC. SuperAdmin-only at the route boundary (the whole
 * /admin/impersonate tree is gated by superAdminMiddleware).
 */
export async function setUserSystemFlag(
  adminId: string,
  userId: string,
  isSystem: boolean,
  deps: AdminUsersDeps = defaultApiDeps(),
): Promise<{ ok: true } | { ok: false; code: "NOT_FOUND" }> {
  const existing = await deps.repos.users.findById(userId);
  if (!existing) return { ok: false, code: "NOT_FOUND" };

  await deps.repos.users.updateById(userId, { isSystem });

  await deps.audit.log({
    actorId: adminId,
    action: AUDIT_ACTIONS.USER_SYSTEM_FLAG_CHANGED,
    targetType: "user",
    targetId: userId,
    metadata: { isSystem },
  });

  return { ok: true };
}

// ── Global stats ─────────────────────────────────────────────────────────────

export interface AdminUsersStats {
  total: number;       // all non-banned users (matches the default list)
  active: number;      // is_active=true AND is_suspended=false AND is_banned=false
  suspended: number;   // is_suspended=true AND is_banned=false
  inactive: number;    // is_active=false AND is_suspended=false AND is_banned=false
  banned: number;      // is_banned=true
  admins: number;      // role='admin' OR is_super_admin=true (excluding banned)
}

/**
 * Aggregate counts for the /admin/users summary cards. Run as one
 * grouped query so the cards always reflect the live database state,
 * not whatever subset of users happens to be on the visible page.
 *
 * The previous implementation derived these from `users.filter(...)` on
 * the visible page — that meant "Active 50" stayed at 50 forever after
 * banning a few rows because the next page had 50 more active users.
 */
export async function getAdminUsersStats(): Promise<AdminUsersStats> {
  const db = getDb();
  const u = schema.users;
  // One round-trip: a single SELECT with conditional sums per status
  // bucket is cheaper than five COUNTs and keeps subrequest usage at 1.
  const [row] = await db
    .select({
      total: sql<number>`sum(case when ${u.isBanned} = false then 1 else 0 end)::int`,
      active: sql<number>`sum(case when ${u.isActive} = true and ${u.isSuspended} = false and ${u.isBanned} = false then 1 else 0 end)::int`,
      suspended: sql<number>`sum(case when ${u.isSuspended} = true and ${u.isBanned} = false then 1 else 0 end)::int`,
      inactive: sql<number>`sum(case when ${u.isActive} = false and ${u.isSuspended} = false and ${u.isBanned} = false then 1 else 0 end)::int`,
      banned: sql<number>`sum(case when ${u.isBanned} = true then 1 else 0 end)::int`,
      admins: sql<number>`sum(case when (${u.role} = 'admin' or ${u.isSuperAdmin} = true) and ${u.isBanned} = false then 1 else 0 end)::int`,
    })
    .from(u);

  return {
    total: Number(row?.total ?? 0),
    active: Number(row?.active ?? 0),
    suspended: Number(row?.suspended ?? 0),
    inactive: Number(row?.inactive ?? 0),
    banned: Number(row?.banned ?? 0),
    admins: Number(row?.admins ?? 0),
  };
}

// ── Bulk ban / delete ────────────────────────────────────────────────────────
// Bulk admin actions triggered from the /admin/users multi-select toolbar.
// Both share: (a) refuse to act on the acting admin themselves, (b) refuse
// to act on any super-admin (defence in depth; the UI also hides the row
// actions but a curl with a bad ID shouldn't nuke a super admin).

export interface BulkResult {
  succeeded: string[];
  skipped: Array<{ userId: string; reason: "not_found" | "self" | "super_admin" }>;
}

async function partitionBulkTargets(
  adminId: string,
  userIds: string[],
  deps: AdminUsersDeps,
): Promise<{ targets: string[]; skipped: BulkResult["skipped"] }> {
  const unique = Array.from(new Set(userIds));
  const rows = await deps.repos.users.findManyByIds(unique);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const skipped: BulkResult["skipped"] = [];
  const targets: string[] = [];
  for (const id of unique) {
    const row = byId.get(id);
    if (!row) { skipped.push({ userId: id, reason: "not_found" }); continue; }
    if (row.id === adminId) { skipped.push({ userId: id, reason: "self" }); continue; }
    if (row.isSuperAdmin || row.role === "super_admin") { skipped.push({ userId: id, reason: "super_admin" }); continue; }
    targets.push(id);
  }
  return { targets, skipped };
}

/**
 * Hard-ban: account blocked + hidden everywhere in the product. Sets
 * is_banned=true and also flips is_active=false + is_suspended=true so
 * every existing login/listing gate in the codebase keeps working without
 * code changes (AuthService rejects is_suspended; public user queries
 * filter is_active=true). The extra is_banned flag only drives the
 * admin-list default exclusion.
 */
export async function bulkBanUsers(
  adminId: string,
  userIds: string[],
  deps: AdminUsersDeps = defaultApiDeps(),
): Promise<BulkResult> {
  const { targets, skipped } = await partitionBulkTargets(adminId, userIds, deps);
  if (targets.length === 0) return { succeeded: [], skipped };

  // Set-based: ONE UPDATE for the whole selection + ONE batched audit
  // INSERT. Previously this loop did 2 × N sequential subrequests, which
  // a 50-user ban blew past the Cloudflare Workers cap on
  // (https://developers.cloudflare.com/workers/wrangler/configuration/#limits).
  await deps.repos.users.updateManyByIds(targets, {
    isBanned: true,
    isActive: false,
    isSuspended: true,
  });
  await deps.audit.logBatch(
    targets.map((id) => ({
      actorId: adminId,
      action: AUDIT_ACTIONS.USER_BANNED,
      targetType: "user",
      targetId: id,
    })),
  );
  return { succeeded: targets, skipped };
}

/**
 * Bulk suspend — set-based equivalent of `setUserStatus(_, _, "suspended")`
 * applied across the whole selection. Suspended users remain visible in
 * the admin list (unlike banned) and an admin can reactivate them
 * through the existing per-row action.
 */
export async function bulkSuspendUsers(
  adminId: string,
  userIds: string[],
  deps: AdminUsersDeps = defaultApiDeps(),
): Promise<BulkResult> {
  const { targets, skipped } = await partitionBulkTargets(adminId, userIds, deps);
  if (targets.length === 0) return { succeeded: [], skipped };

  // Same subrequest-budget rationale as bulkBanUsers above.
  await deps.repos.users.updateManyByIds(targets, {
    isSuspended: true,
    isActive: false,
  });
  await deps.audit.logBatch(
    targets.map((id) => ({
      actorId: adminId,
      action: AUDIT_ACTIONS.USER_STATUS_CHANGED,
      targetType: "user",
      targetId: id,
      metadata: { status: "suspended" },
    })),
  );
  return { succeeded: targets, skipped };
}

/**
 * Hard-delete. Used for spammers — the caller has explicitly decided they
 * want NO data retained. FK cascades (migration 0029) wipe the user's
 * own sidecar rows; admin-surface references (audit actor, override
 * grantor, etc.) SET NULL so unrelated rows stay intact.
 *
 * Audit rows where the deleted user was the *target* are not covered by
 * any FK (target_id is a free-text column so the same log can point at
 * roles / modules / tenants). We clean those up explicitly here so
 * "no data retained" actually means no data retained.
 */
export async function bulkDeleteUsers(
  adminId: string,
  userIds: string[],
  deps: AdminUsersDeps = defaultApiDeps(),
): Promise<BulkResult> {
  const { targets, skipped } = await partitionBulkTargets(adminId, userIds, deps);
  if (targets.length === 0) return { succeeded: [], skipped };

  const db = getDb();
  // Order matters:
  //   1. Wipe the spammer's *prior* audit history (target_id is TEXT so
  //      no FK cascade handles it).
  //   2. DELETE the user row — FK cascades wipe the user's own sidecars;
  //      SET-NULL constraints null out admin-surface pointers.
  //   3. Write the USER_DELETED audit entry AFTER, so it isn't swept up
  //      by step 1. This last row has the deleted user's UUID as
  //      target_id (now an orphan) — intentionally kept as the tombstone
  //      for the admin's action.
  await db
    .delete(schema.adminAuditLog)
    .where(and(
      eq(schema.adminAuditLog.targetType, "user"),
      inArray(schema.adminAuditLog.targetId, targets),
    ));

  // Snapshot the doomed videos' R2 keys BEFORE the cascade drops the rows.
  // `videos.userId references users(id) on delete cascade` wipes the DB rows
  // but leaks the R2 blobs (gap #730), so reclaim them explicitly. Best-effort
  // / idempotent — a failure here must not abort the purge.
  const doomedVideos = await db
    .select({ r2Key: schema.videos.r2Key })
    .from(schema.videos)
    .where(inArray(schema.videos.userId, targets));

  await db.delete(schema.users).where(inArray(schema.users.id, targets));

  await reclaimVideoR2(doomedVideos);

  // Batched audit insert — one subrequest instead of N.
  await deps.audit.logBatch(
    targets.map((id) => ({
      actorId: adminId,
      action: AUDIT_ACTIONS.USER_DELETED,
      targetType: "user",
      targetId: id,
    })),
  );

  return { succeeded: targets, skipped };
}

// ── Token administration ─────────────────────────────────────────────────────

/**
 * Zero out a user's current-month monthly-bucket usage by deleting their
 * `aiUsageRecords` rows with `source = "monthly"` in the current calendar
 * month. Pack balance is untouched. Returns the number of tokens that were
 * reset so the caller can surface it in the audit log / UI.
 */
export async function resetUserMonthlyTokens(
  adminId: string,
  userId: string,
  deps: AdminUsersDeps = defaultApiDeps(),
): Promise<{ ok: true; tokensReset: number } | { ok: false; code: "NOT_FOUND" }> {
  const existing = await deps.repos.users.findById(userId);
  if (!existing) return { ok: false, code: "NOT_FOUND" };

  const now = deps.now();
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const tokensReset = await deps.repos.tokens.monthlyUsedByUser(userId, periodStart, periodEnd);
  await deps.repos.tokens.deleteMonthlyUsageForUser(userId, periodStart, periodEnd);

  await deps.audit.log({
    actorId: adminId,
    action: AUDIT_ACTIONS.TOKENS_RESET,
    targetType: "user",
    targetId: userId,
    metadata: {
      tokensReset,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    },
  });

  return { ok: true, tokensReset };
}

/**
 * Grant additional tokens to a user's purchased-pack balance. Recorded as a
 * `tokenPackPurchases` row with `packId = "admin_grant"` and `pricePaid = 0`
 * so the ledger stays consistent with paid top-ups.
 */
export async function grantUserTokens(
  adminId: string,
  userId: string,
  tokens: number,
  reason?: string,
  deps: AdminUsersDeps = defaultApiDeps(),
): Promise<{ ok: true } | { ok: false; code: "NOT_FOUND" }> {
  if (!Number.isInteger(tokens) || tokens <= 0) {
    throw new Error("tokens must be a positive integer");
  }
  const existing = await deps.repos.users.findById(userId);
  if (!existing) return { ok: false, code: "NOT_FOUND" };

  // Record the ledger row (kept in the same shape paid purchases use so
  // the audit trail is uniform between paid and admin-granted tokens).
  await deps.repos.tokens.insertPurchase({
    userId,
    packId: "admin_grant",
    tokensGranted: tokens,
    pricePaid: "0",
    currency: "USD",
    stripePaymentIntentId: null,
    status: "paid",
  } as any);

  // Bump the user's balance atomically (upsert + increment).
  await deps.repos.tokens.upsertBalance(userId, tokens, tokens);

  await deps.audit.log({
    actorId: adminId,
    action: AUDIT_ACTIONS.TOKENS_GRANTED,
    targetType: "user",
    targetId: userId,
    metadata: { tokens, reason: reason ?? null },
  });

  return { ok: true };
}

// ── Resume data heal ─────────────────────────────────────────────────────────

export interface ResumeHealFailure {
  resumeId: string;
  title: string;
  issues: ResumeContentIssue[];
}

export interface ResumeHealReport {
  total: number;
  healed: number;
  clean: number;
  failed: number;
  failures: ResumeHealFailure[];
}

/**
 * Iterate every resume owned by `userId`, run its `content` blob through
 * `healAndValidateContent`, and persist the healed shape back when it
 * differs from what's stored. Intended as a one-shot cleanup triggered
 * from the /admin/users ellipsis — prevention at the write boundary is
 * handled by callers using `healAndValidateContent` directly.
 *
 *  - `healed` counts rows the heal actually changed (`isDeepStrictEqual`
 *    was false), so it's an honest "fixed" count rather than "touched".
 *  - `failed` captures rows whose content couldn't be coerced to a
 *    schema-valid shape even after heal — those are left untouched and
 *    reported with their Zod issues so ops can investigate.
 *  - `updatedAt` is deliberately not bumped: the heal is a schema
 *    migration, not a user edit, and bumping would churn list ordering.
 */
export async function healUserResumes(
  adminId: string,
  userId: string,
  deps: AdminUsersDeps = defaultApiDeps(),
): Promise<{ ok: true; report: ResumeHealReport } | { ok: false; code: "NOT_FOUND" }> {
  const userRow = await deps.repos.users.findById(userId);
  if (!userRow) return { ok: false, code: "NOT_FOUND" };

  const repo = deps.repos.resumes;
  const rows = await repo.findAllForOwner(userId);

  let healed = 0;
  let clean = 0;
  const failures: ResumeHealFailure[] = [];

  for (const row of rows) {
    const result = healAndValidateContent(row.content);
    if (!result.ok) {
      failures.push({ resumeId: row.id, title: row.title, issues: result.issues });
      continue;
    }
    if (isDeepStrictEqual(row.content, result.content)) {
      clean++;
      continue;
    }
    // Heal is a schema migration, not a user edit — opt out of the
    // repo's default updatedAt bump so list ordering doesn't churn.
    await repo.updateByIdForOwner(
      row.id,
      userId,
      { content: result.content as Record<string, unknown> },
      { touchUpdatedAt: false },
    );
    healed++;
  }

  const report: ResumeHealReport = {
    total: rows.length,
    healed,
    clean,
    failed: failures.length,
    failures,
  };

  await deps.audit.log({
    actorId: adminId,
    action: AUDIT_ACTIONS.RESUME_DATA_HEALED,
    targetType: "user",
    targetId: userId,
    metadata: {
      total: report.total,
      healed: report.healed,
      clean: report.clean,
      failed: report.failed,
      // Only log the identifiers for failures; the issue list can be
      // large and contains user content snippets — fetch on demand
      // from the returned report if needed.
      failedResumeIds: failures.map((f) => f.resumeId),
    },
  });

  return { ok: true, report };
}
