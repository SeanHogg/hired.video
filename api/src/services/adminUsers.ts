import { and, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";
import { auditLog, AUDIT_ACTIONS } from "../utils/audit.js";

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

  return { users, total, page, limit: safeLimit };
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

