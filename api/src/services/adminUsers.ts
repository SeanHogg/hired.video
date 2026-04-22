import { and, count, desc, eq, gte, ilike, inArray, lt, or, sql, sum, type SQL } from "drizzle-orm";
import { isDeepStrictEqual } from "node:util";
import { getDb, schema } from "../db/index.js";
import { auditLog, AUDIT_ACTIONS } from "../utils/audit.js";
import { sendPasswordResetEmail } from "./email.js";
import { ResumeRepository } from "../repositories/resumeRepository.js";
import {
  healAndValidateContent,
  type ResumeContentIssue,
} from "./resume-content-service.js";
import {
  resolveEffectivePlan,
  type PlanOverrideSnapshot,
  type SubscriptionSnapshot,
} from "../domains/planOverride/resolver.js";
import { USER_ROLES } from "../../../shared/user-roles.js";

// ── User search / detail ──────────────────────────────────────────────────────

export interface UserSearchParams {
  page?: number;
  limit?: number;
  search?: string;
  role?: string;
  status?: "active" | "suspended";
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

export async function searchUsers({ page = 1, limit = 50, search, role, status }: UserSearchParams) {
  const db = getDb();
  const safeLimit = Math.min(limit, 100);
  const offset = (page - 1) * safeLimit;

  const conditions: SQL[] = [];
  if (search) conditions.push(or(ilike(schema.users.email, `%${search}%`), ilike(schema.users.name, `%${search}%`)));
  if (role) conditions.push(eq(schema.users.role, role));
  if (status === "active") conditions.push(eq(schema.users.isActive, true));
  if (status === "suspended") conditions.push(eq(schema.users.isSuspended, true));

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
        isSuperAdmin: schema.users.isSuperAdmin,
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
    userIds.length === 0
      ? Promise.resolve([] as Array<{ userId: string; planSlug: string; planName: string; status: string }>)
      : db
          .select({
            userId: schema.subscriptions.userId,
            planSlug: schema.subscriptionPlans.slug,
            planName: schema.subscriptionPlans.name,
            status: schema.subscriptions.status,
          })
          .from(schema.subscriptions)
          .innerJoin(
            schema.subscriptionPlans,
            eq(schema.subscriptions.planId, schema.subscriptionPlans.id),
          )
          .where(
            and(
              inArray(schema.subscriptions.userId, userIds),
              inArray(schema.subscriptions.status, ["active", "trialing"]),
            ),
          ),
    userIds.length === 0
      ? Promise.resolve([] as Array<{ userId: string; used: string | null }>)
      : db
          .select({
            userId: schema.aiUsageRecords.userId,
            used: sum(schema.aiUsageRecords.totalTokens),
          })
          .from(schema.aiUsageRecords)
          .where(
            and(
              inArray(schema.aiUsageRecords.userId, userIds),
              eq(schema.aiUsageRecords.source, "monthly"),
              gte(schema.aiUsageRecords.createdAt, periodStart),
              lt(schema.aiUsageRecords.createdAt, periodEnd),
            ),
          )
          .groupBy(schema.aiUsageRecords.userId),
    userIds.length === 0
      ? Promise.resolve([] as Array<{ userId: string; balance: number }>)
      : db
          .select({
            userId: schema.userTokenBalance.userId,
            balance: schema.userTokenBalance.balance,
          })
          .from(schema.userTokenBalance)
          .where(inArray(schema.userTokenBalance.userId, userIds)),
    // Tool-run tallies drive the "Tools used" column on /admin/users so
    // ops can see who's actually engaging with the AI tools at a glance.
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
    // Resume counts — drives the "Resumes" column and doubles as the
    // gate for the "Heal resume data" ellipsis action (hidden when 0).
    // Goes through ResumeRepository so the resume_information table has
    // a single DB-access seam per the layering rule.
    new ResumeRepository(db).countByOwnerBulk(userIds),
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
): Promise<{ ok: true } | { ok: false; code: "NOT_FOUND" }> {
  const db = getDb();
  const [existing] = await db
    .select({ id: schema.users.id, role: schema.users.role })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  if (!existing) return { ok: false, code: "NOT_FOUND" };

  await db.update(schema.users).set({ role, updatedAt: new Date() } as any).where(eq(schema.users.id, userId));

  await auditLog({
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
): Promise<
  | { ok: true; email: string }
  | { ok: false; code: "NOT_FOUND" }
> {
  const db = getDb();
  const [user] = await db
    .select({ id: schema.users.id, email: schema.users.email, name: schema.users.name })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (!user) return { ok: false, code: "NOT_FOUND" };

  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await db
    .update(schema.passwordResetTokens)
    .set({ used: true } as any)
    .where(eq(schema.passwordResetTokens.userId, user.id));
  await db.insert(schema.passwordResetTokens).values({ userId: user.id, token, expiresAt });

  await sendPasswordResetEmail(user.email, user.name, token);

  await auditLog({
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
): Promise<void> {
  const db = getDb();
  await db
    .update(schema.users)
    .set({ isSuspended: status === "suspended", isActive: status === "active", updatedAt: new Date() } as any)
    .where(eq(schema.users.id, userId));

  await auditLog({
    actorId: adminId,
    action: AUDIT_ACTIONS.USER_STATUS_CHANGED,
    targetType: "user",
    targetId: userId,
    metadata: { status },
  });
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
): Promise<{ ok: true; tokensReset: number } | { ok: false; code: "NOT_FOUND" }> {
  const db = getDb();
  const [existing] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (!existing) return { ok: false, code: "NOT_FOUND" };

  const now = new Date();
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const periodFilter = and(
    eq(schema.aiUsageRecords.userId, userId),
    eq(schema.aiUsageRecords.source, "monthly"),
    gte(schema.aiUsageRecords.createdAt, periodStart),
    lt(schema.aiUsageRecords.createdAt, periodEnd),
  );

  const [usedRow] = await db
    .select({ used: sum(schema.aiUsageRecords.totalTokens) })
    .from(schema.aiUsageRecords)
    .where(periodFilter);
  const tokensReset = Number(usedRow?.used ?? 0);

  await db.delete(schema.aiUsageRecords).where(periodFilter);

  await auditLog({
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
): Promise<{ ok: true } | { ok: false; code: "NOT_FOUND" }> {
  if (!Number.isInteger(tokens) || tokens <= 0) {
    throw new Error("tokens must be a positive integer");
  }
  const db = getDb();
  const [existing] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (!existing) return { ok: false, code: "NOT_FOUND" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db.insert(schema.tokenPackPurchases) as any).values({
    userId,
    packId: "admin_grant",
    tokensGranted: tokens,
    pricePaid: "0",
    currency: "USD",
    stripePaymentIntentId: null,
    status: "paid",
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db.insert(schema.userTokenBalance) as any)
    .values({
      userId,
      balance: tokens,
      lifetimeGranted: tokens,
      lifetimeConsumed: 0,
    })
    .onConflictDoUpdate({
      target: schema.userTokenBalance.userId,
      set: {
        balance: sql`${schema.userTokenBalance.balance} + ${tokens}`,
        lifetimeGranted: sql`${schema.userTokenBalance.lifetimeGranted} + ${tokens}`,
        updatedAt: new Date(),
      },
    });

  await auditLog({
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
): Promise<{ ok: true; report: ResumeHealReport } | { ok: false; code: "NOT_FOUND" }> {
  const db = getDb();

  const [userRow] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (!userRow) return { ok: false, code: "NOT_FOUND" };

  const repo = new ResumeRepository(db);
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

  await auditLog({
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
