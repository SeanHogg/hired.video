/**
 * Shared HMAC signing primitives for short-lived, stateless auth tokens
 * (trusted-device cookie, 2FA one-tap approve link). Both consumers were
 * computing the same `HMAC-SHA256 over a dotted payload, keyed by
 * JWT_SECRET` by hand; this is the single source of truth so the format
 * can't drift between mint and verify sides.
 */

import { getJwtSecretOptional } from "../../utils/jwt.js";

/** JWT_SECRET resolution, delegated to the single reader in utils/jwt.ts so
 *  signed tokens use the same key everywhere.
 *
 *  Returns "" when unset — a DELIBERATE contract, unlike the copies that
 *  used to litter the routes: every caller here (trusted-device cookie, 2FA
 *  approve link, partner embed token) checks for the empty value and omits
 *  the token rather than emitting an unverifiable one. Callers that MUST
 *  have a key import `getJwtSecret()` instead, which throws. */
export function getAuthSecret(): string {
  return getJwtSecretOptional() ?? "";
}

/** Lowercase hex HMAC-SHA256 of `message` under `secret` (defaults to the
 *  auth secret). */
export async function hmacHex(message: string, secret: string = getAuthSecret()): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
