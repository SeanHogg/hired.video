/**
 * Session lifecycle — mint (with the 3-device cap), list, revoke (one /
 * family / all-for-user), trust, and the session_version bump. Every
 * revoke path invalidates the validity cache. Split out of sessions.ts
 * (now a re-export facade).
 */
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { schema } from "../../db/index.js";
import type { Session } from "../../db/schema/users.js";
import {
  MAX_ACTIVE_SESSIONS_PER_USER,
  SESSION_TTL_MS,
  deriveDeviceLabel,
  generateRefreshToken,
  hashRefreshToken,
} from "./session-tokens.js";
import { invalidateSessionCache } from "./session-cache.js";

const { sessions, users } = schema;

export interface CreateSessionInput {
  db: any;
  userId: string;
  deviceFingerprint?: string | null;
  ipAddress?: string | null;
  ipCountry?: string | null;
  userAgent?: string | null;
  trusted?: boolean;
}

export interface CreatedSession {
  session: Session;
  refreshToken: string;
}

/**
 * Mint a fresh session row and return the plaintext refresh token.
 * Caller is responsible for handing the refresh token to the client
 * (cookie or response body). Enforces the 3-device cap before insert
 * so the cap is applied uniformly across every login path.
 */
export async function createSession(input: CreateSessionInput): Promise<CreatedSession> {
  const { db, userId } = input;

  await enforceSessionCap(db, userId);

  const refreshToken = generateRefreshToken();
  const refreshTokenHash = await hashRefreshToken(refreshToken);
  const familyId = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  const [session] = await db
    .insert(sessions)
    .values({
      userId,
      familyId,
      refreshTokenHash,
      deviceFingerprint: input.deviceFingerprint ?? null,
      deviceLabel: deriveDeviceLabel(input.userAgent ?? null),
      ipAddress: input.ipAddress ?? null,
      ipCountry: input.ipCountry ?? null,
      userAgent: input.userAgent ?? null,
      trusted: input.trusted ?? false,
      trustedUntil: input.trusted ? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) : null,
      lastSeenAt: now,
      expiresAt,
    } as any)
    .returning();

  return { session, refreshToken };
}

/**
 * Active = not revoked AND not absolutely expired. We sort oldest-first
 * because every caller of this fn wants either "show me the list" (any
 * order is fine) or "evict the oldest" (this order). One source of truth.
 */
export async function getActiveSessions(db: any, userId: string): Promise<Session[]> {
  const now = new Date();
  return db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.userId, userId),
        isNull(sessions.revokedAt),
        sql`${sessions.expiresAt} > ${now}`,
      ),
    )
    .orderBy(asc(sessions.createdAt));
}

/**
 * If the user already has MAX_ACTIVE_SESSIONS_PER_USER active rows,
 * revoke enough of the oldest to leave room for one more. Called from
 * createSession (pre-insert) so login flows never need to think about
 * the cap themselves.
 */
export async function enforceSessionCap(db: any, userId: string): Promise<void> {
  const active = await getActiveSessions(db, userId);
  const overage = active.length - (MAX_ACTIVE_SESSIONS_PER_USER - 1);
  if (overage <= 0) return;
  const ids = active.slice(0, overage).map((s: Session) => s.id);
  await db
    .update(sessions)
    .set({ revokedAt: new Date(), revokedReason: "replaced_by_cap" } as any)
    .where(and(inArray(sessions.id, ids), isNull(sessions.revokedAt)));
  ids.forEach(invalidateSessionCache);
}

export async function revokeSession(
  db: any,
  sessionId: string,
  reason: string,
): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date(), revokedReason: reason } as any)
    .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
  invalidateSessionCache(sessionId);
}

/**
 * Revoke a session only when it belongs to `userId` — the user-facing
 * "revoke this device" action. Returns false when no such session exists
 * for the user (caller answers 404).
 */
export async function revokeOwnSession(
  db: any,
  userId: string,
  sessionId: string,
  reason: string,
): Promise<boolean> {
  const [target] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
    .limit(1);
  if (!target) return false;
  await revokeSession(db, sessionId, reason);
  return true;
}

/**
 * Revoke every session row sharing a family_id. Called when a refresh
 * token is replayed (already rotated) — the canonical signal of token
 * theft per RFC 6749 §10.4.
 */
export async function revokeSessionFamily(
  db: any,
  familyId: string,
  reason: string = "family_revoked",
): Promise<void> {
  const revoked: Array<{ id: string }> = await db
    .update(sessions)
    .set({ revokedAt: new Date(), revokedReason: reason } as any)
    .where(and(eq(sessions.familyId, familyId), isNull(sessions.revokedAt)))
    .returning({ id: sessions.id });
  revoked.forEach((r) => invalidateSessionCache(r.id));
}

/**
 * Revoke every active session for a user. Used by the password-reset
 * success path and the user-facing "log out other devices" button.
 * `keepSessionId` lets the caller preserve the current session (so the
 * user isn't logged out of the device they just clicked on).
 */
export async function revokeAllSessionsForUser(
  db: any,
  userId: string,
  reason: string,
  keepSessionId?: string,
): Promise<void> {
  const conditions = [eq(sessions.userId, userId), isNull(sessions.revokedAt)];
  if (keepSessionId) conditions.push(sql`${sessions.id} != ${keepSessionId}`);
  const revoked: Array<{ id: string }> = await db
    .update(sessions)
    .set({ revokedAt: new Date(), revokedReason: reason } as any)
    .where(and(...conditions))
    .returning({ id: sessions.id });
  revoked.forEach((r) => invalidateSessionCache(r.id));
}

/**
 * "Trust this device for 30 days." Called from the post-2FA verify
 * path when the user ticks the trusted-device checkbox. Trusted
 * sessions skip the MFA prompt on subsequent logins (the adaptive-MFA
 * scoring fn — Phase 3 — reads this field).
 */
export async function trustSession(db: any, sessionId: string): Promise<void> {
  const trustedUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await db
    .update(sessions)
    .set({ trusted: true, trustedUntil } as any)
    .where(eq(sessions.id, sessionId));
}

// Re-exported so the password-reset handler can bump session_version
// without importing drizzle directly. Single source of truth for the
// "invalidate every old JWT in the wild" primitive.
export async function bumpSessionVersion(db: any, userId: string): Promise<void> {
  await db
    .update(users)
    .set({ sessionVersion: sql`${users.sessionVersion} + 1` } as any)
    .where(eq(users.id, userId));
}
