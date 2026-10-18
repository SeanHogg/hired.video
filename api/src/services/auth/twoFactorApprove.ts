/**
 * One-tap "approve sign-in" token for the email-2FA step-up (gap #2225).
 *
 * The 2FA email already carries a 6-digit code the user types back into
 * the login screen. On a phone that round-trip is the friction point, so
 * the email ALSO carries a tap-to-approve link. Tapping it completes the
 * login server-side — same security property as the code (both prove the
 * recipient controls the mailbox), no typing.
 *
 * The link must NOT be approvable by anyone who only knows the
 * `tempAuthToken` (the challenge row id), because that value is handed to
 * the browser that started the login. So the link carries a stateless
 * HMAC signature over the challenge id, keyed by JWT_SECRET — knowledge of
 * the id alone can't forge it, and no schema column is needed (the
 * two_factor `auth_tokens` row's `usedAt`/`expiresAt` remain the replay guard).
 *
 * Format: `<challengeId>.<hmacHex(challengeId)>`
 */

import { getAuthSecret, hmacHex } from "./signing.js";

/** Mint the signed approve token for a pending 2FA challenge. Returns null
 *  when no signing secret is configured (dev/tests) so callers omit the
 *  link rather than emit an unverifiable one. */
export async function mintTwoFactorApproveToken(challengeId: string): Promise<string | null> {
  const secret = getAuthSecret();
  if (!secret) return null;
  const sig = await hmacHex(challengeId, secret);
  return `${challengeId}.${sig}`;
}

/** Verify an approve token and recover the challenge id it was minted for.
 *  Returns `{ ok: false }` on any malformed / unsigned / mismatched token.
 *  The caller still has to load the challenge row and enforce
 *  used/expired — this only proves the id wasn't tampered with. */
export async function verifyTwoFactorApproveToken(
  token: string,
): Promise<{ ok: boolean; challengeId?: string }> {
  const secret = getAuthSecret();
  if (!secret) return { ok: false };
  // Split on the LAST dot so a uuid challenge id (which has no dots, but
  // be defensive) can't be confused with the signature segment.
  const lastDot = token.lastIndexOf(".");
  if (lastDot <= 0) return { ok: false };
  const challengeId = token.slice(0, lastDot);
  const sig = token.slice(lastDot + 1);
  if (!challengeId || !sig) return { ok: false };
  const expected = await hmacHex(challengeId, secret);
  if (sig !== expected) return { ok: false };
  return { ok: true, challengeId };
}
