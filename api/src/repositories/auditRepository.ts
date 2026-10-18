/**
 * AuditRepository — the immutable "who did what" record.
 *
 * Covers:
 *   • adminAuditLog            — every SuperAdmin action
 *   • impersonationSessions    — active/ended impersonation sessions
 *   • impersonationRoleSwitches— per-session persona switches
 *   • activityLogs             — user-facing activity feed
 *
 * Kept separate from AuthTokens and Authz because audit writes are
 * append-only (no mutation after insert), the read patterns are
 * totally different (time-ordered, paginated, filtered by actor/
 * target/action), and the retention rules will eventually diverge
 * (audit rows typically live longer than sessions).
 *
 * The audit write is fire-and-forget by contract: a failed audit
 * insert MUST NOT block the operation being audited.
 */

import { and, count, desc, eq, isNull } from "drizzle-orm";
import { schema } from "../db/index.js";

const {
  adminAuditLog,
  impersonationSessions,
  impersonationRoleSwitches,
  activityLogs,
} = schema;

export type DbLike = any;

export type AdminAuditLogRow = typeof adminAuditLog.$inferSelect;
export type AdminAuditLogInsert = typeof adminAuditLog.$inferInsert;
export type ImpersonationSessionRow = typeof impersonationSessions.$inferSelect;
export type ImpersonationSessionInsert = typeof impersonationSessions.$inferInsert;
export type ImpersonationRoleSwitchRow = typeof impersonationRoleSwitches.$inferSelect;
export type ImpersonationRoleSwitchInsert = typeof impersonationRoleSwitches.$inferInsert;
export type ActivityLogRow = typeof activityLogs.$inferSelect;
export type ActivityLogInsert = typeof activityLogs.$inferInsert;

export interface IAuditRepository {
  insertAdminAudit(input: AdminAuditLogInsert): Promise<void>;
  listAdminAudit(page?: number, limit?: number): Promise<{ rows: AdminAuditLogRow[]; total: number }>;
  findOpenImpersonationSession(superAdminId: string): Promise<ImpersonationSessionRow | null>;
  findImpersonationSessionsForTarget(targetUserId: string, limit?: number): Promise<ImpersonationSessionRow[]>;
  insertImpersonationSession(input: ImpersonationSessionInsert): Promise<ImpersonationSessionRow>;
  endImpersonationSession(id: string, endReason: string): Promise<void>;
  insertImpersonationRoleSwitch(input: ImpersonationRoleSwitchInsert): Promise<void>;
  insertActivity(input: ActivityLogInsert): Promise<void>;
  /** Multi-row insert (one statement) — the analytics beacon batches. */
  insertActivities(rows: readonly ActivityLogInsert[]): Promise<void>;
  findActivityForUser(userId: string, limit?: number): Promise<ActivityLogRow[]>;
}

export class AuditRepository implements IAuditRepository {
  constructor(private readonly db: DbLike, private readonly now: () => Date = () => new Date()) {}

  async insertAdminAudit(input: AdminAuditLogInsert): Promise<void> {
    await this.db.insert(adminAuditLog).values(input as any);
  }

  async listAdminAudit(page = 1, limit = 50) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(200, Math.max(1, limit));
    const offset = (safePage - 1) * safeLimit;
    const [rows, [{ total }]] = await Promise.all([
      this.db.select().from(adminAuditLog).orderBy(desc(adminAuditLog.createdAt)).limit(safeLimit).offset(offset),
      this.db.select({ total: count() }).from(adminAuditLog),
    ]);
    return { rows: rows as AdminAuditLogRow[], total: Number(total) };
  }

  async findOpenImpersonationSession(superAdminId: string): Promise<ImpersonationSessionRow | null> {
    const [row] = await this.db
      .select()
      .from(impersonationSessions)
      .where(and(
        eq(impersonationSessions.superAdminId, superAdminId),
        isNull(impersonationSessions.endedAt),
      ))
      .limit(1);
    return (row as ImpersonationSessionRow) ?? null;
  }

  async findImpersonationSessionsForTarget(targetUserId: string, limit = 10): Promise<ImpersonationSessionRow[]> {
    return (await this.db
      .select()
      .from(impersonationSessions)
      .where(eq(impersonationSessions.targetUserId, targetUserId))
      .orderBy(desc(impersonationSessions.startedAt))
      .limit(Math.min(100, Math.max(1, limit)))) as ImpersonationSessionRow[];
  }

  async insertImpersonationSession(input: ImpersonationSessionInsert): Promise<ImpersonationSessionRow> {
    const [row] = await this.db.insert(impersonationSessions).values(input as any).returning();
    return row as ImpersonationSessionRow;
  }

  async endImpersonationSession(id: string, endReason: string): Promise<void> {
    await this.db
      .update(impersonationSessions)
      .set({ endedAt: this.now(), endReason } as any)
      .where(eq(impersonationSessions.id, id));
  }

  async insertImpersonationRoleSwitch(input: ImpersonationRoleSwitchInsert): Promise<void> {
    await this.db.insert(impersonationRoleSwitches).values(input as any);
  }

  async insertActivity(input: ActivityLogInsert): Promise<void> {
    await this.db.insert(activityLogs).values(input as any);
  }

  async insertActivities(rows: readonly ActivityLogInsert[]): Promise<void> {
    if (rows.length === 0) return;
    await this.db.insert(activityLogs).values([...rows]);
  }

  async findActivityForUser(userId: string, limit = 50): Promise<ActivityLogRow[]> {
    return (await this.db
      .select()
      .from(activityLogs)
      .where(eq(activityLogs.userId, userId))
      .orderBy(desc(activityLogs.createdAt))
      .limit(Math.min(200, Math.max(1, limit)))) as ActivityLogRow[];
  }
}
