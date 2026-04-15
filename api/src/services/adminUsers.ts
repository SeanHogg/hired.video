import { and, count, desc, eq, gte, ilike, inArray, lt, or, sum, type SQL } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";
import { auditLog, AUDIT_ACTIONS } from "../utils/audit.js";
import { FREE_AI_MONTHLY_TOKENS, PRO_AI_MONTHLY_TOKENS } from "../../../shared/pricing.js";

// ── User search / detail ──────────────────────────────────────────────────────

export interface UserSearchParams {
  page?: number;
  limit?: number;
  search?: string;
  role?: string;
  status?: "active" | "suspended";
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

  const [subRows, usageRows, balanceRows] = await Promise.all([
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
  ]);

  const subByUser = new Map(subRows.map((r) => [r.userId, r]));
  const usedByUser = new Map(usageRows.map((r) => [r.userId, Number(r.used ?? 0)]));
  const packByUser = new Map(balanceRows.map((r) => [r.userId, r.balance]));

  const enriched = users.map((u) => {
    const sub = subByUser.get(u.id);
    const isInternal = u.isSuperAdmin || u.role === "SuperAdmin" || u.role === "Admin";
    const planSlug = isInternal ? "admin" : (sub?.planSlug ?? "free");
    const planName = isInternal ? "Admin" : (sub?.planName ?? "Free");
    const isPaid = !isInternal && !!sub && sub.planSlug !== "free";
    const monthlyUsed = usedByUser.get(u.id) ?? 0;
    const packBalance = packByUser.get(u.id) ?? 0;
    const monthlyLimit = isInternal
      ? null
      : isPaid
      ? PRO_AI_MONTHLY_TOKENS
      : FREE_AI_MONTHLY_TOKENS;
    const monthlyRemaining = monthlyLimit === null ? null : Math.max(0, monthlyLimit - monthlyUsed);
    const tokensAvailable = monthlyLimit === null ? null : (monthlyRemaining ?? 0) + packBalance;
    return {
      ...u,
      planId: planSlug,
      planName,
      isPaid,
      isUnlimited: isInternal,
      monthlyLimit,
      monthlyUsed,
      packBalance,
      tokensAvailable,
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

