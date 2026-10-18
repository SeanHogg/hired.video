/**
 * UserSettingsRepository — the user-row / session reads
 * and writes behind /api/settings that are NOT plain one-row-per-user
 * preference upserts (those live in PreferencesRepository).
 *
 *   • users flags      — mfaEnabled / passwordHash / doNotShare
 *   • do-not-share     — flag + forced cookie opt-out (CCPA/CPRA)
 *   • sessions         — active (non-revoked, non-expired) refresh tokens
 */

import { and, eq, gt } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";
import { PreferencesRepository } from "./preferencesRepository.js";

const { users, refreshTokens } = schema;

export async function findUserMfaEnabled(userId: string): Promise<boolean | null> {
  const [row] = await getDb().select({ mfaEnabled: users.mfaEnabled }).from(users).where(eq(users.id, userId)).limit(1);
  return row ? row.mfaEnabled : null;
}

export async function findUserSecurityFlags(
  userId: string,
): Promise<{ mfaEnabled: boolean; passwordHash: string | null } | null> {
  const [row] = await getDb()
    .select({ mfaEnabled: users.mfaEnabled, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row ?? null;
}

export async function findDoNotShare(userId: string): Promise<boolean | null> {
  const [row] = await getDb().select({ doNotShare: users.doNotShare }).from(users).where(eq(users.id, userId)).limit(1);
  return row ? row.doNotShare : null;
}

/** Set users.do_not_share; when opting OUT, also force the marketing /
 *  personalization cookie categories off (a first cookie save leaves
 *  analytics at its default, false). */
export async function setDoNotShare(userId: string, doNotShare: boolean, now: Date): Promise<void> {
  const db = getDb();
  await db.update(users).set({ doNotShare, updatedAt: now } as any).where(eq(users.id, userId));
  if (!doNotShare) return;
  await new PreferencesRepository(db, () => now).forceCookieOptOut(userId);
}

export async function listActiveSessions(userId: string, now: Date) {
  return getDb()
    .select({
      id: refreshTokens.id,
      createdAt: refreshTokens.createdAt,
      expiresAt: refreshTokens.expiresAt,
    })
    .from(refreshTokens)
    .where(
      and(
        eq(refreshTokens.userId, userId),
        eq(refreshTokens.revoked, false),
        gt(refreshTokens.expiresAt, now),
      ),
    )
    .orderBy(refreshTokens.createdAt);
}

/** Revoke one of the user's sessions. Returns false when no row matched. */
export async function revokeSession(userId: string, sessionId: string): Promise<boolean> {
  const [updated] = await getDb()
    .update(refreshTokens)
    .set({ revoked: true } as any)
    .where(and(eq(refreshTokens.id, sessionId), eq(refreshTokens.userId, userId)))
    .returning({ id: refreshTokens.id });
  return !!updated;
}

export async function disableMfa(userId: string): Promise<void> {
  await getDb().update(users).set({ mfaEnabled: false, mfaSecret: null } as any).where(eq(users.id, userId));
}
