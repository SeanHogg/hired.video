/**
 * Per-request session validation for the auth middleware — validity
 * check, sliding-inactivity policy, debounced last_seen touch.
 * Split out of sessions.ts (now a re-export facade).
 */
import { eq } from "drizzle-orm";
import { schema } from "../../db/index.js";
import type { Session } from "../../db/schema/users.js";
import { IDLE_TIMEOUT_MS } from "./session-tokens.js";
import { loadSessionValidity } from "./session-cache.js";
import { revokeSession } from "./session-lifecycle.js";

const { sessions } = schema;

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
