/**
 * Symmetric encryption for OAuth refresh tokens at rest.
 *
 * AES-GCM via Web Crypto API (available in Cloudflare Workers + Node 18+).
 * The 256-bit key is derived from `EXTERNAL_EMAIL_TOKEN_KEY` (or, as a
 * fallback for non-prod boots, from `JWT_SECRET` with a domain-separated
 * HKDF salt so token-cipher keys are never identical to JWT signing
 * keys). 12-byte IV per ciphertext, output is `iv:ciphertext` hex.
 *
 * Plaintext refresh tokens never touch storage — `external_email_accounts.
 * oauth_refresh_token_enc` always holds the encrypted form.
 */

const HKDF_INFO = new TextEncoder().encode("hired.video/external-email/refresh-token/v1");

function getEnv(key: string): string {
  return process.env[key] || (globalThis as any).__ENV?.[key] || "";
}

async function deriveKey(): Promise<CryptoKey> {
  const explicit = getEnv("EXTERNAL_EMAIL_TOKEN_KEY");
  const seed = explicit || getEnv("JWT_SECRET");
  if (!seed) throw new Error("EXTERNAL_EMAIL_TOKEN_KEY or JWT_SECRET must be set");

  const ikm = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(seed),
    "HKDF",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: HKDF_INFO },
    ikm,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export async function encryptToken(plaintext: string): Promise<string> {
  const key = await deriveKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return `${toHex(iv)}:${toHex(new Uint8Array(ct))}`;
}

export async function decryptToken(encoded: string): Promise<string> {
  const [ivHex, ctHex] = encoded.split(":");
  if (!ivHex || !ctHex) throw new Error("Malformed encrypted token");
  const key = await deriveKey();
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromHex(ivHex) },
    key,
    fromHex(ctHex),
  );
  return new TextDecoder().decode(pt);
}
