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

/** Fire-and-forget audit log insertion. Errors are swallowed to never block the calling route. */
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
