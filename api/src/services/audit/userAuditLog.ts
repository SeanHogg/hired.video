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

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import {
  accountLocks,
  adminAuditLog,
  emailChangeRequests,
  impersonationSessions,
  passwordHistory,
  sessions,
} from "../../db/schema/index.js";

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
  {
    const rows = await db
      .select({
        id: sessions.id,
        createdAt: sessions.createdAt,
        revokedAt: sessions.revokedAt,
        revokedReason: sessions.revokedReason,
        ipAddress: sessions.ipAddress,
        ipCountry: sessions.ipCountry,
        userAgent: sessions.userAgent,
        deviceLabel: sessions.deviceLabel,
      })
      .from(sessions)
      .where(eq(sessions.userId, userId))
      .orderBy(desc(sessions.createdAt))
      .limit(perSource)
      .catch(() => []);
    for (const r of rows) {
      const where = [r.deviceLabel, r.ipCountry, r.ipAddress].filter(Boolean).join(" · ");
      events.push({
        id: `session-login-${r.id}`,
        kind: "login",
        occurredAt: r.createdAt.toISOString(),
        title: "Signed in",
        detail: where || null,
        severity: "info",
        metadata: { sessionId: r.id, userAgent: r.userAgent },
      });
      if (r.revokedAt) {
        events.push({
          id: `session-revoked-${r.id}`,
          kind: "session_revoked",
          occurredAt: r.revokedAt.toISOString(),
          title: "Session revoked",
          detail: [r.revokedReason, where].filter(Boolean).join(" — ") || null,
          severity: r.revokedReason === "compromised" ? "critical" : "info",
          metadata: { sessionId: r.id },
        });
      }
    }
  }

  // ── password history
  {
    const rows = await db
      .select({ id: passwordHistory.id, createdAt: passwordHistory.createdAt })
      .from(passwordHistory)
      .where(eq(passwordHistory.userId, userId))
      .orderBy(desc(passwordHistory.createdAt))
      .limit(perSource)
      .catch(() => []);
    for (const r of rows) {
      events.push({
        id: `pw-${r.id}`,
        kind: "password_changed",
        occurredAt: r.createdAt.toISOString(),
        title: "Password changed",
        detail: null,
        severity: "info",
      });
    }
  }

  // ── email change requests. `consumedAt` is set when both tokens are
  // confirmed and the user.email mutation lands — i.e. the change completed.
  {
    const rows = await db
      .select({
        id: emailChangeRequests.id,
        createdAt: emailChangeRequests.createdAt,
        consumedAt: emailChangeRequests.consumedAt,
        newEmail: emailChangeRequests.newEmail,
        currentEmail: emailChangeRequests.currentEmail,
      })
      .from(emailChangeRequests)
      .where(eq(emailChangeRequests.userId, userId))
      .orderBy(desc(emailChangeRequests.createdAt))
      .limit(perSource)
      .catch(() => []);
    for (const r of rows) {
      events.push({
        id: `email-req-${r.id}`,
        kind: "email_change_requested",
        occurredAt: r.createdAt.toISOString(),
        title: "Email change requested",
        detail: `${r.currentEmail} → ${r.newEmail}`,
        severity: "warn",
        metadata: { newEmail: r.newEmail },
      });
      if (r.consumedAt) {
        events.push({
          id: `email-done-${r.id}`,
          kind: "email_changed",
          occurredAt: r.consumedAt.toISOString(),
          title: "Email changed",
          detail: `${r.currentEmail} → ${r.newEmail}`,
          severity: "warn",
        });
      }
    }
  }

  // ── account locks
  {
    const rows = await db
      .select({
        id: accountLocks.id,
        lockedAt: accountLocks.lockedAt,
        unlockedAt: accountLocks.unlockedAt,
        reason: accountLocks.reason,
        notes: accountLocks.notes,
      })
      .from(accountLocks)
      .where(eq(accountLocks.userId, userId))
      .orderBy(desc(accountLocks.lockedAt))
      .limit(perSource)
      .catch(() => []);
    for (const r of rows) {
      events.push({
        id: `lock-${r.id}`,
        kind: "account_locked",
        occurredAt: r.lockedAt.toISOString(),
        title: "Account locked",
        detail: [r.reason, r.notes].filter(Boolean).join(" — ") || null,
        severity: "critical",
      });
      if (r.unlockedAt) {
        events.push({
          id: `unlock-${r.id}`,
          kind: "account_unlocked",
          occurredAt: r.unlockedAt.toISOString(),
          title: "Account unlocked",
          detail: r.reason ?? null,
          severity: "info",
        });
      }
    }
  }

  // ── impersonation sessions (a SuperAdmin took over the user)
  {
    const rows = await db
      .select({
        id: impersonationSessions.id,
        startedAt: impersonationSessions.startedAt,
        endedAt: impersonationSessions.endedAt,
        reason: impersonationSessions.reason,
      })
      .from(impersonationSessions)
      .where(eq(impersonationSessions.targetUserId, userId))
      .orderBy(desc(impersonationSessions.startedAt))
      .limit(perSource)
      .catch(() => []);
    for (const r of rows) {
      events.push({
        id: `imp-start-${r.id}`,
        kind: "impersonation_started",
        occurredAt: r.startedAt.toISOString(),
        title: "SuperAdmin impersonation started",
        detail: r.reason ?? "Support session",
        severity: "warn",
      });
      if (r.endedAt) {
        events.push({
          id: `imp-end-${r.id}`,
          kind: "impersonation_ended",
          occurredAt: r.endedAt.toISOString(),
          title: "SuperAdmin impersonation ended",
          detail: r.reason ?? null,
          severity: "info",
        });
      }
    }
  }

  // ── admin audit log entries targeting this user
  {
    const rows = await db
      .select({
        id: adminAuditLog.id,
        createdAt: adminAuditLog.createdAt,
        action: adminAuditLog.action,
        actorId: adminAuditLog.actorId,
        metadata: adminAuditLog.metadata,
      })
      .from(adminAuditLog)
      .where(
        and(
          eq(adminAuditLog.targetType, "user"),
          eq(adminAuditLog.targetId, userId),
        ),
      )
      .orderBy(desc(adminAuditLog.createdAt))
      .limit(perSource)
      .catch(() => []);
    for (const r of rows) {
      events.push({
        id: `admin-${r.id}`,
        kind: "admin_action",
        occurredAt: r.createdAt.toISOString(),
        title: `Admin: ${r.action}`,
        detail: r.actorId ? `Performed by admin ${String(r.actorId).slice(0, 8)}…` : null,
        severity: "warn",
        metadata: (r.metadata as Record<string, unknown> | null) ?? undefined,
      });
    }
  }

  events.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));
  return events.slice(0, limit);
}
