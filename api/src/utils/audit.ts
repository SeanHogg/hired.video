import { count, desc } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";

/** Typed constants for all admin audit actions. */
export const AUDIT_ACTIONS = {
  IMPERSONATION_STARTED: "IMPERSONATION_STARTED",
  IMPERSONATION_ENDED: "IMPERSONATION_ENDED",
  IMPERSONATION_PERSONA_SWITCHED: "IMPERSONATION_PERSONA_SWITCHED",
  USER_ROLE_CHANGED: "USER_ROLE_CHANGED",
  USER_STATUS_CHANGED: "USER_STATUS_CHANGED",
  USER_BANNED: "USER_BANNED",
  USER_UNBANNED: "USER_UNBANNED",
  USER_DELETED: "USER_DELETED",
  MODULE_ASSIGNED: "MODULE_ASSIGNED",
  MODULE_REMOVED: "MODULE_REMOVED",
  MODULE_CREATED: "MODULE_CREATED",
  MODULE_UPDATED: "MODULE_UPDATED",
  TOKENS_RESET: "TOKENS_RESET",
  TOKENS_GRANTED: "TOKENS_GRANTED",
  PASSWORD_RESET_SENT: "PASSWORD_RESET_SENT",
  ADMIN_OVERRIDE_SET: "ADMIN_OVERRIDE_SET",
  ADMIN_OVERRIDE_CLEARED: "ADMIN_OVERRIDE_CLEARED",
  RESUME_DATA_HEALED: "RESUME_DATA_HEALED",
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
    } as any);
  } catch (err) {
    console.error("[audit] Failed to write audit log entry:", err);
  }
}

/**
 * Batched variant of `auditLog` — writes many entries in a single
 * INSERT. Use this from bulk admin operations (ban / suspend / delete
 * 50 users at a time) so they don't blow the Cloudflare Workers
 * subrequest budget. Same fire-and-forget contract as `auditLog`.
 */
export async function auditLogBatch(entries: AuditEntry[]): Promise<void> {
  if (entries.length === 0) return;
  try {
    const db = getDb();
    await db.insert(schema.adminAuditLog).values(
      entries.map((entry) => ({
        actorId: entry.actorId,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        metadata: entry.metadata as any,
        impersonationSessionId: entry.impersonationSessionId,
      })) as any,
    );
  } catch (err) {
    console.error("[audit] Failed to write batched audit log entries:", err);
  }
}
