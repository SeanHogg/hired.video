import { count, desc } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";

/** Typed constants for all admin audit actions. */
export const AUDIT_ACTIONS = {
  IMPERSONATION_STARTED: "IMPERSONATION_STARTED",
  IMPERSONATION_ENDED: "IMPERSONATION_ENDED",
  IMPERSONATION_PERSONA_SWITCHED: "IMPERSONATION_PERSONA_SWITCHED",
  USER_ROLE_CHANGED: "USER_ROLE_CHANGED",
  USER_STATUS_CHANGED: "USER_STATUS_CHANGED",
  MODULE_ASSIGNED: "MODULE_ASSIGNED",
  MODULE_REMOVED: "MODULE_REMOVED",
  MODULE_CREATED: "MODULE_CREATED",
  MODULE_UPDATED: "MODULE_UPDATED",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

interface AuditEntry {
  actorId: string;
  action: AuditAction;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  impersonationSessionId?: string;
}

export async function listAuditLog(page: number, limit: number) {
  const db = getDb();
  const safeLimit = Math.min(limit, 200);
  const offset = (page - 1) * safeLimit;

  const [logs, [{ total }]] = await Promise.all([
    db
      .select()
      .from(schema.adminAuditLog)
      .orderBy(desc(schema.adminAuditLog.createdAt))
      .limit(safeLimit)
      .offset(offset),
    db.select({ total: count() }).from(schema.adminAuditLog),
  ]);

  return { logs, total, page, limit: safeLimit };
}

/**
 * Writes an audit log entry.
 *
 * NOTE: Errors are logged but not re-thrown so a failed audit write never
 * blocks the originating operation. If your compliance requirements demand
 * transactional audit guarantees, change this to throw and wrap callers in
 * a transaction.
 */
export async function auditLog(entry: AuditEntry): Promise<void> {
  try {
    const db = getDb();
    await db.insert(schema.adminAuditLog).values({
      actorId: entry.actorId,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      metadata: entry.metadata as any,
      impersonationSessionId: entry.impersonationSessionId,
    });
  } catch (err) {
    console.error("[audit] Failed to write audit log entry:", err);
  }
}
