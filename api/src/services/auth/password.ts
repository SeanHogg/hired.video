/**
 * Password + one-time-code primitives — the ONE PBKDF2 implementation.
 * Stored format: `<saltHex>:<hashHex>` (16-byte salt, PBKDF2-SHA-256,
 * 100,000 iterations, 256-bit key). Used by the auth routes/service, the
 * OAuth "add password" route, password-history reuse checks, the partner
 * job-seeker provisioning and the seed script.
 */
import { bytesToHex, timingSafeEqual } from "../../utils/crypto.js";

const PBKDF2_ITERATIONS = 100_000;
const KEY_BITS = 256;

async function derivePasswordHex(password: string, salt: Uint8Array): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    KEY_BITS,
  );
  return bytesToHex(bits);
}

/** Hash a password into the stored `salt:hash` hex format. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `${bytesToHex(salt)}:${await derivePasswordHex(password, salt)}`;
}

/** True when `password` matches the stored `salt:hash`. Missing/malformed → false. */
export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const saltBytes = saltHex.match(/.{2}/g);
  if (!saltBytes) return false;
  const salt = new Uint8Array(saltBytes.map((b) => parseInt(b, 16)));
  return timingSafeEqual(await derivePasswordHex(password, salt), hashHex);
}

/** Six random digits for email verification / 2FA codes. */
export function generateVerificationCode(): string {
  const digits = Array.from(crypto.getRandomValues(new Uint8Array(6))).map((b) => (b % 10).toString());
  return digits.join("");
}
