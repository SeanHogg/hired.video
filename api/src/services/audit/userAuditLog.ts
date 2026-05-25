/**
 * User-facing audit log — a unified read-only view across the existing
 * audit-bearing tables: `sessions`, `password_history`,
 * `email_change_requests`, `account_locks`, `impersonation_sessions`,
 * `admin_audit_log` (where target is this user). No new schema —
 * everything is sourced from tables that already capture the event;
 * this service just normalises and sorts them into a single feed for
 * the Account Settings → Audit Trail panel.
 *
 * Greenhouse-grade audit-trail rigor lives in #1222 (logged); the
 * v1 surface here is "every security-relevant event you can already
 * see in scattered settings tabs, in one place, in chronological order."
 */

import { and, desc, eq, or, sql } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";

export type AuditEventKind =
  | "login"
  | "session_revoked"
  | "password_changed"
  | "email_change_requested"
  | "email_changed"
  | "account_locked"
  | "account_unlocked"
  | "impersonation_started"
  | "impersonation_ended"
  | "admin_action";

export interface AuditEvent {
  id: string;
  kind: AuditEventKind;
  occurredAt: string; // ISO
  /** Short headline rendered as the row title. */
  title: string;
  /** Optional secondary line (IP / device / actor / extra context). */
  detail: string | null;
  /** Optional risk pill on the row. */
  severity: "info" | "warn" | "critical";
  metadata?: Record<string, unknown>;
}

/** Collect every audit-relevant row for one user across the source tables.
 *  Limit applied per source then re-merged + sorted; we cap each source so
 *  one chatty source (login sessions) can't crowd out the others. */
export async function fetchUserAuditEvents(
  userId: string,
  limit = 100,
): Promise<AuditEvent[]> {
  const db = getDb();
  const perSource = Math.max(10, Math.ceil(limit / 4));
  const events: AuditEvent[] = [];

  // ── sessions: login + revoke
  const sessionsTable = (schema as any).sessions;
  if (sessionsTable) {
    const rows = await db
      .select({
        id: sessionsTable.id,
        createdAt: sessionsTable.createdAt,
        revokedAt: sessionsTable.revokedAt,
        revokedReason: sessionsTable.revokedReason,
        ipAddress: sessionsTable.ipAddress,
        ipCountry: sessionsTable.ipCountry,
        userAgent: sessionsTable.userAgent,
        deviceLabel: sessionsTable.deviceLabel,
      })
      .from(sessionsTable)
      .where(eq(sessionsTable.userId, userId))
      .orderBy(desc(sessionsTable.createdAt))
      .limit(perSource)
      .catch(() => []);
    for (const r of rows as any[]) {
      const where = [r.deviceLabel, r.ipCountry, r.ipAddress].filter(Boolean).join(" · ");
      events.push({
        id: `session-login-${r.id}`,
        kind: "login",
        occurredAt: (r.createdAt as Date).toISOString(),
        title: "Signed in",
        detail: where || null,
        severity: "info",
        metadata: { sessionId: r.id, userAgent: r.userAgent },
      });
      if (r.revokedAt) {
        events.push({
          id: `session-revoked-${r.id}`,
          kind: "session_revoked",
          occurredAt: (r.revokedAt as Date).toISOString(),
          title: "Session revoked",
          detail: [r.revokedReason, where].filter(Boolean).join(" — ") || null,
          severity: r.revokedReason === "compromised" ? "critical" : "info",
          metadata: { sessionId: r.id },
        });
      }
    }
  }

  // ── password history
  const passwordTable = (schema as any).passwordHistory;
  if (passwordTable) {
    const rows = await db
      .select({ id: passwordTable.id, createdAt: passwordTable.createdAt })
      .from(passwordTable)
      .where(eq(passwordTable.userId, userId))
      .orderBy(desc(passwordTable.createdAt))
      .limit(perSource)
      .catch(() => []);
    for (const r of rows as any[]) {
      events.push({
        id: `pw-${r.id}`,
        kind: "password_changed",
        occurredAt: (r.createdAt as Date).toISOString(),
        title: "Password changed",
        detail: null,
        severity: "info",
      });
    }
  }

  // ── email change requests
  const emailChangeTable = (schema as any).emailChangeRequests;
  if (emailChangeTable) {
    const rows = await db
      .select({
        id: emailChangeTable.id,
        createdAt: emailChangeTable.createdAt,
        completedAt: emailChangeTable.completedAt ?? sql`null`,
        newEmail: emailChangeTable.newEmail,
        currentEmail: emailChangeTable.currentEmail,
      })
      .from(emailChangeTable)
      .where(eq(emailChangeTable.userId, userId))
      .orderBy(desc(emailChangeTable.createdAt))
      .limit(perSource)
      .catch(() => []);
    for (const r of rows as any[]) {
      events.push({
        id: `email-req-${r.id}`,
        kind: "email_change_requested",
        occurredAt: (r.createdAt as Date).toISOString(),
        title: "Email change requested",
        detail: `${r.currentEmail} → ${r.newEmail}`,
        severity: "warn",
        metadata: { newEmail: r.newEmail },
      });
      if (r.completedAt) {
        events.push({
          id: `email-done-${r.id}`,
          kind: "email_changed",
          occurredAt: (r.completedAt as Date).toISOString(),
          title: "Email changed",
          detail: `${r.currentEmail} → ${r.newEmail}`,
          severity: "warn",
        });
      }
    }
  }

  // ── account locks
  const locksTable = (schema as any).accountLocks;
  if (locksTable) {
    const rows = await db
      .select({
        id: locksTable.id,
        lockedAt: locksTable.lockedAt,
        unlockedAt: locksTable.unlockedAt,
        reason: locksTable.reason,
        notes: locksTable.notes,
      })
      .from(locksTable)
      .where(eq(locksTable.userId, userId))
      .orderBy(desc(locksTable.lockedAt))
      .limit(perSource)
      .catch(() => []);
    for (const r of rows as any[]) {
      events.push({
        id: `lock-${r.id}`,
        kind: "account_locked",
        occurredAt: (r.lockedAt as Date).toISOString(),
        title: "Account locked",
        detail: [r.reason, r.notes].filter(Boolean).join(" — ") || null,
        severity: "critical",
      });
      if (r.unlockedAt) {
        events.push({
          id: `unlock-${r.id}`,
          kind: "account_unlocked",
          occurredAt: (r.unlockedAt as Date).toISOString(),
          title: "Account unlocked",
          detail: r.reason ?? null,
          severity: "info",
        });
      }
    }
  }

  // ── impersonation sessions (a SuperAdmin took over the user)
  const impersonationTable = (schema as any).impersonationSessions;
  if (impersonationTable) {
    const rows = await db
      .select({
        id: impersonationTable.id,
        startedAt: impersonationTable.startedAt,
        endedAt: impersonationTable.endedAt,
        actorId: impersonationTable.actorId,
        reason: impersonationTable.reason,
      })
      .from(impersonationTable)
      .where(eq(impersonationTable.targetUserId, userId))
      .orderBy(desc(impersonationTable.startedAt))
      .limit(perSource)
      .catch(() => []);
    for (const r of rows as any[]) {
      events.push({
        id: `imp-start-${r.id}`,
        kind: "impersonation_started",
        occurredAt: (r.startedAt as Date).toISOString(),
        title: "SuperAdmin impersonation started",
        detail: r.reason ?? "Support session",
        severity: "warn",
      });
      if (r.endedAt) {
        events.push({
          id: `imp-end-${r.id}`,
          kind: "impersonation_ended",
          occurredAt: (r.endedAt as Date).toISOString(),
          title: "SuperAdmin impersonation ended",
          detail: r.reason ?? null,
          severity: "info",
        });
      }
    }
  }

  // ── admin audit log entries targeting this user
  const adminTable = (schema as any).adminAuditLog;
  if (adminTable) {
    const rows = await db
      .select({
        id: adminTable.id,
        createdAt: adminTable.createdAt,
        action: adminTable.action,
        actorId: adminTable.actorId,
        metadata: adminTable.metadata,
      })
      .from(adminTable)
      .where(
        and(
          eq(adminTable.targetType, "user"),
          eq(adminTable.targetId, userId),
        ),
      )
      .orderBy(desc(adminTable.createdAt))
      .limit(perSource)
      .catch(() => []);
    for (const r of rows as any[]) {
      events.push({
        id: `admin-${r.id}`,
        kind: "admin_action",
        occurredAt: (r.createdAt as Date).toISOString(),
        title: `Admin: ${r.action}`,
        detail: r.actorId ? `Performed by admin ${String(r.actorId).slice(0, 8)}…` : null,
        severity: "warn",
        metadata: r.metadata ?? undefined,
      });
    }
  }

  events.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));
  return events.slice(0, limit);
}
