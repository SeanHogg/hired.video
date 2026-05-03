/**
 * TOTP (RFC 6238) — Time-based One-Time Passwords for second-factor auth.
 *
 * Schema fields `users.mfaEnabled` and `users.mfaSecret` already exist
 * on the user table; this file wires the actual generation and
 * verification using HMAC-SHA1 (the RFC-default, also what Google
 * Authenticator / 1Password / Authy implement).
 *
 * Single source of truth for TOTP. The /api/auth/totp/setup,
 * /api/auth/totp/verify, /api/auth/totp/disable routes all funnel
 * through these primitives.
 */

import { eq } from "drizzle-orm";
import { schema } from "../../db/index.js";

const { users } = schema;

const TOTP_PERIOD_SEC = 30;
const TOTP_DIGITS = 6;
// Base32 alphabet (RFC 4648). otpauth:// URIs require base32 secrets.
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function generateBase32Secret(byteLen = 20): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLen));
  let bits = 0;
  let value = 0;
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i]!;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += BASE32[(value << (5 - bits)) & 0x1f];
  }
  return out;
}

function base32Decode(b32: string): Uint8Array {
  const cleaned = b32.toUpperCase().replace(/=+$/, "");
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (let i = 0; i < cleaned.length; i++) {
    const idx = BASE32.indexOf(cleaned[i]!);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

async function hmacSha1(key: Uint8Array, msg: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, msg);
  return new Uint8Array(sig);
}

/** Compute the TOTP for a given secret + counter (Unix-time / period). */
async function totpAt(secretB32: string, counter: number): Promise<string> {
  const key = base32Decode(secretB32);
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  // 64-bit big-endian counter
  view.setUint32(0, Math.floor(counter / 0x100000000));
  view.setUint32(4, counter >>> 0);
  const hmac = await hmacSha1(key, new Uint8Array(buf));
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const code =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return (code % 10 ** TOTP_DIGITS).toString().padStart(TOTP_DIGITS, "0");
}

/**
 * Verify a presented 6-digit code against the user's stored secret.
 * Accepts the current step plus the previous and next steps to
 * tolerate ±30 second clock drift (RFC 6238 §6).
 */
export async function verifyTotp(secretB32: string, presented: string): Promise<boolean> {
  if (!/^\d{6}$/.test(presented)) return false;
  const now = Math.floor(Date.now() / 1000 / TOTP_PERIOD_SEC);
  for (const offset of [-1, 0, 1]) {
    const candidate = await totpAt(secretB32, now + offset);
    if (candidate === presented) return true;
  }
  return false;
}

/**
 * Begin TOTP setup: generate a fresh secret and persist it on the user
 * row WITHOUT flipping mfaEnabled. The user must verify a code from
 * the generated secret first (call `confirmTotpSetup`) before the
 * second factor goes live — that proves the secret made it into their
 * authenticator app cleanly.
 */
export async function beginTotpSetup(
  db: any,
  userId: string,
  email: string,
): Promise<{ secret: string; otpauthUrl: string }> {
  const secret = generateBase32Secret();
  await db.update(users).set({ mfaSecret: secret } as any).where(eq(users.id, userId));
  const issuer = encodeURIComponent("hired.video");
  const account = encodeURIComponent(`${issuer}:${email}`);
  const otpauthUrl =
    `otpauth://totp/${account}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD_SEC}`;
  return { secret, otpauthUrl };
}

/**
 * Finalise TOTP setup: verify a code and, if it matches, flip
 * mfaEnabled. Returns true on success. Caller is expected to also
 * generate backup codes after this returns true.
 */
export async function confirmTotpSetup(
  db: any,
  userId: string,
  presented: string,
): Promise<boolean> {
  const [user] = await db
    .select({ mfaSecret: users.mfaSecret })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user?.mfaSecret) return false;
  const ok = await verifyTotp(user.mfaSecret, presented);
  if (!ok) return false;
  await db.update(users).set({ mfaEnabled: true } as any).where(eq(users.id, userId));
  return true;
}

/**
 * Disable TOTP. Requires a current valid code so a session-hijack
 * can't silently turn off MFA.
 */
export async function disableTotp(
  db: any,
  userId: string,
  presented: string,
): Promise<boolean> {
  const [user] = await db
    .select({ mfaSecret: users.mfaSecret })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user?.mfaSecret) return false;
  const ok = await verifyTotp(user.mfaSecret, presented);
  if (!ok) return false;
  await db
    .update(users)
    .set({ mfaEnabled: false, mfaSecret: null } as any)
    .where(eq(users.id, userId));
  return true;
}
