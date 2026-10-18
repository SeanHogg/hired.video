/**
 * Session-validity isolate cache — the narrow per-session projection
 * `loadSessionForJwt` reads on every request, and its invalidation hook
 * every revoke path calls. Split out of sessions.ts (now a facade).
 */
import { eq } from "drizzle-orm";
import { schema } from "../../db/index.js";
import { getOrSetIsolateCached, invalidateIsolateKey } from "../../utils/isolate-cache.js";

const { sessions } = schema;

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

export interface SessionValidity {
  id: string;
  userId: string;
  revoked: boolean;
  expiresAtMs: number;
  lastSeenAtMs: number;
}

function sessionCacheKey(sessionId: string): string {
  return `sess:v1:${sessionId}`;
}

export function invalidateSessionCache(sessionId: string): void {
  invalidateIsolateKey(sessionCacheKey(sessionId));
}

export async function loadSessionValidity(db: any, sessionId: string): Promise<SessionValidity | null> {
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
