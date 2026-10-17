/**
 * Best-effort SuperAdmin audit trail write (admin_audit_log). The ONE helper
 * admin routes call after a mutation; a failed audit write never fails the
 * action itself.
 */
import { getDb } from "../../db/index.js";
import { AuditRepository } from "../../repositories/auditRepository.js";

export interface AdminAuditEntry {
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
}

export async function recordAdminAudit(entry: AdminAuditEntry): Promise<void> {
  await new AuditRepository(getDb()).insertAdminAudit(entry).catch(() => undefined);
}
