/**
 * Sessions service — single source of truth for everything that touches
 * the `sessions` table.
 *
 * Why these functions live here (and not duplicated in routes/middleware):
 *   1. Login, OAuth callback, magic-link verify, and 2FA verify all need
 *      to mint a session row. Centralising in `createSession` means the
 *      3-device cap, family/fingerprint logic, and trusted-device defaults
 *      can't drift between flows.
 *   2. Auth middleware needs to validate-and-touch on every request.
 *      `loadSessionForJwt` is the only path that does so.
 *   3. SuperAdmin "revoke this device" and user "log out other devices"
 *      both call `revokeSession` / `revokeAllSessionsForUser` — same fn,
 *      different caller.
 *   4. RFC 6749 §10.4 refresh-token rotation with reuse detection lives in
 *      `rotateRefreshToken` and `revokeSessionFamily`. If a token is
 *      replayed (already-rotated), we burn the entire family — that's
 *      the standard signal of token theft.
 */

import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { schema } from "../../db/index.js";
import type { Session } from "../../db/schema/users.js";
import { getOrSetIsolateCached, invalidateIsolateKey } from "../../utils/isolate-cache.js";

const { sessions, users } = schema;

// 3-device cap — when a 4th login arrives, the oldest *active* session
// is revoked with reason 'replaced_by_cap'. Configurable per deployment
// later; lives here so login + magic-link + OAuth all read the same
// number.
export const MAX_ACTIVE_SESSIONS_PER_USER = 3;

// Sliding inactivity window. Sessions whose last_seen_at is older than
// this are revoked at next-touch with reason 'idle_timeout'. The
// absolute expiry (expires_at) is independent and longer.
export const IDLE_TIMEOUT_MS = 14 * 24 * 60 * 60 * 1000;

// Absolute session lifetime when a non-trusted device logs in.
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// Refresh tokens are opaque base64url secrets; we only ever store their
// SHA-256 hash so a DB leak doesn't hand attackers usable bearers.
async function hashRefreshToken(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateRefreshToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Best-effort UA → human label. Intentionally loose — we just want
 * "Chrome on macOS" / "Safari on iPhone" for the sessions UI. Wrong-but-
 * close is fine; this is operator-facing not security-critical.
 */
export function deriveDeviceLabel(userAgent: string | null): string {
  if (!userAgent) return "Unknown device";
  const ua = userAgent.toLowerCase();
  let browser = "Browser";
  if (ua.includes("edg/")) browser = "Edge";
  else if (ua.includes("chrome/") && !ua.includes("edg/")) browser = "Chrome";
  else if (ua.includes("firefox/")) browser = "Firefox";
  else if (ua.includes("safari/") && !ua.includes("chrome/")) browser = "Safari";

  let os = "Unknown OS";
  if (ua.includes("windows")) os = "Windows";
  else if (ua.includes("mac os x") || ua.includes("macos")) os = "macOS";
  else if (ua.includes("iphone") || ua.includes("ipad")) os = "iOS";
  else if (ua.includes("android")) os = "Android";
  else if (ua.includes("linux")) os = "Linux";

  return `${browser} on ${os}`;
}

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

// ---------------------------------------------------------------------------
// Session-validity cache
//
// `loadSessionForJwt` runs on EVERY authenticated request, and Neon is
// HTTP-backed, so an uncached SELECT here is a full network round-trip per
// API call. We cache a narrow validity projection per session id in the
// isolate (utils/isolate-cache.ts). NOT in Workers KV: on Workers Free
// (~1,000 KV writes/day) a put per session per minute exhausted the budget.
// Every revoke path in this module invalidates the key, so revocation is
// immediate in the revoking isolate; other warm isolates honour it within
// SESSION_CACHE_TTL_SECONDS (the same ≤30s bound the old L1 cap gave).
// ---------------------------------------------------------------------------

const SESSION_CACHE_TTL_SECONDS = 30;

interface SessionValidity {
  id: string;
  userId: string;
  revoked: boolean;
  expiresAtMs: number;
  lastSeenAtMs: number;
}

function sessionCacheKey(sessionId: string): string {
  return `sess:v1:${sessionId}`;
}

function invalidateSessionCache(sessionId: string): void {
  invalidateIsolateKey(sessionCacheKey(sessionId));
}

async function loadSessionValidity(db: any, sessionId: string): Promise<SessionValidity | null> {
  return getOrSetIsolateCached<SessionValidity | null>({
    key: sessionCacheKey(sessionId),
    ttlSeconds: SESSION_CACHE_TTL_SECONDS,
    loader: async () => {
      const [row] = await db
        .select({
          id: sessions.id,
          userId: sessions.userId,
          revokedAt: sessions.revokedAt,
          expiresAt: sessions.expiresAt,
          lastSeenAt: sessions.lastSeenAt,
        })
        .from(sessions)
        .where(eq(sessions.id, sessionId))
        .limit(1);
      if (!row) return null;
      return {
        id: row.id,
        userId: row.userId,
        revoked: !!row.revokedAt,
        expiresAtMs: new Date(row.expiresAt).getTime(),
        lastSeenAtMs: new Date(row.lastSeenAt).getTime(),
      };
    },
  });
}

/**
 * Look up the session referenced by a JWT's `sid` claim and apply the
 * sliding-inactivity policy. Returns the session's identity if it's still
 * usable, or null if it's revoked / expired / idle-timeout-tripped (in
 * which case it's been revoked as a side effect — caller should reject
 * the request).
 *
 * Bumps last_seen_at at most once per LAST_SEEN_DEBOUNCE_MS per session.
 * last_seen_at only feeds the 14-day idle timeout and the "active
 * sessions" list, so 15-minute resolution is plenty — and the touch does
 * NOT invalidate the validity cache (last_seen isn't part of validity), so
 * a touch costs one UPDATE and no follow-up SELECT + KV put.
 */
const LAST_SEEN_DEBOUNCE_MS = 15 * 60 * 1000;

/** Isolate-local record of the last touch per session. The cached validity
 *  projection keeps the pre-touch lastSeenAt for up to its TTL, so without
 *  this the same isolate would re-issue the UPDATE on every request until
 *  the entry expired. Bounded: cleared wholesale past the cap. */
const _lastTouchMs = new Map<string, number>();
const LAST_TOUCH_MAX_ENTRIES = 10_000;

function lastTouchFor(sessionId: string, cachedLastSeenMs: number): number {
  const local = _lastTouchMs.get(sessionId);
  return local !== undefined && local > cachedLastSeenMs ? local : cachedLastSeenMs;
}

function recordTouch(sessionId: string, atMs: number): void {
  if (_lastTouchMs.size >= LAST_TOUCH_MAX_ENTRIES) _lastTouchMs.clear();
  _lastTouchMs.set(sessionId, atMs);
}

export async function loadSessionForJwt(
  db: any,
  sessionId: string,
): Promise<Pick<Session, "id" | "userId"> | null> {
  const state = await loadSessionValidity(db, sessionId);
  if (!state || state.revoked) return null;
  const now = Date.now();
  if (state.expiresAtMs <= now) {
    await revokeSession(db, state.id, "expired");
    return null;
  }
  if (now - state.lastSeenAtMs > IDLE_TIMEOUT_MS) {
    await revokeSession(db, state.id, "idle_timeout");
    return null;
  }
  if (now - lastTouchFor(state.id, state.lastSeenAtMs) > LAST_SEEN_DEBOUNCE_MS) {
    recordTouch(state.id, now);
    await db.update(sessions).set({ lastSeenAt: new Date(now) } as any).where(eq(sessions.id, state.id));
  }
  return { id: state.id, userId: state.userId };
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
 * Refresh-token rotation with reuse detection.
 *
 *   1. Hash the presented token, look up the session.
 *   2. If not found → invalid.
 *   3. If found but already revoked (rotated_to_session_id set) → REUSE
 *      DETECTED. Burn the whole family.
 *   4. Otherwise: insert successor row, link this row to it, revoke this
 *      one with reason 'rotated', return successor + new token.
 */
export async function rotateRefreshToken(
  db: any,
  presentedToken: string,
  context: {
    deviceFingerprint?: string | null;
    ipAddress?: string | null;
    ipCountry?: string | null;
    userAgent?: string | null;
  },
): Promise<{ session: Session; refreshToken: string } | { error: "invalid" } | { error: "reused" }> {
  const presentedHash = await hashRefreshToken(presentedToken);
  const [current] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.refreshTokenHash, presentedHash))
    .limit(1);

  if (!current) return { error: "invalid" };

  if (current.revokedAt) {
    // Reuse of a rotated token = theft signal. Burn the family.
    await revokeSessionFamily(db, current.familyId, "family_revoked");
    return { error: "reused" };
  }

  const now = new Date();
  if (new Date(current.expiresAt) <= now) {
    await revokeSession(db, current.id, "expired");
    return { error: "invalid" };
  }

  const successorToken = generateRefreshToken();
  const successorHash = await hashRefreshToken(successorToken);

  const [successor] = await db
    .insert(sessions)
    .values({
      userId: current.userId,
      familyId: current.familyId,
      refreshTokenHash: successorHash,
      deviceFingerprint: context.deviceFingerprint ?? current.deviceFingerprint,
      deviceLabel: deriveDeviceLabel(context.userAgent ?? current.userAgent),
      ipAddress: context.ipAddress ?? current.ipAddress,
      ipCountry: context.ipCountry ?? current.ipCountry,
      userAgent: context.userAgent ?? current.userAgent,
      trusted: current.trusted,
      trustedUntil: current.trustedUntil,
      lastSeenAt: now,
      expiresAt: current.expiresAt,
    } as any)
    .returning();

  await db
    .update(sessions)
    .set({
      revokedAt: now,
      revokedReason: "rotated",
      rotatedToSessionId: successor.id,
    } as any)
    .where(eq(sessions.id, current.id));
  invalidateSessionCache(current.id);

  return { session: successor, refreshToken: successorToken };
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
