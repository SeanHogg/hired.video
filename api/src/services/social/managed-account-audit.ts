/**
 * Admin-audit trail for the SuperAdmin managed brand accounts (Lane A).
 * Best-effort: an audit insert failure is logged, never surfaced to the SA.
 */
import { getDb } from "../../db/index.js";
import { AuditRepository } from "../../repositories/auditRepository.js";
import { logger } from "../../lib/logger.js";

export async function recordManagedAccountAudit(actorId: string, action: string, platform: string): Promise<void> {
  try {
    await new AuditRepository(getDb()).insertAdminAudit({
      actorId,
      action,
      targetType: "managed_account",
      targetId: platform,
      metadata: { platform },
    });
  } catch (err) {
    logger.error("[social] managed-account audit insert failed", err);
  }
}
