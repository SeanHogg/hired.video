/**
 * RFC 6749 §10.4 refresh-token rotation with reuse detection.
 * Split out of sessions.ts (now a re-export facade).
 */
import { eq } from "drizzle-orm";
import { schema } from "../../db/index.js";
import type { Session } from "../../db/schema/users.js";
import { deriveDeviceLabel, generateRefreshToken, hashRefreshToken } from "./session-tokens.js";
import { invalidateSessionCache } from "./session-cache.js";
import { revokeSession, revokeSessionFamily } from "./session-lifecycle.js";

const { sessions } = schema;

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
