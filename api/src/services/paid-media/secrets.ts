/**
 * Envelope encryption for paid-media credential columns
 * (paid_media_connections.access_token_enc, refresh_token_enc;
 * paid_media_pixels.*_token_enc).
 *
 * Uses AES-GCM with a 256-bit key derived from PAID_MEDIA_KMS_KEY via
 * HKDF-SHA-256. Each ciphertext is self-describing: base64(iv) || "." ||
 * base64(ciphertext+tag) so rotating the master key only requires
 * re-encrypting on next write — no schema change.
 *
 * NEVER call crypto.subtle from a route handler — always route through
 * encryptSecret / decryptSecret here so the key derivation stays in one
 * place and audit logging can hook the seam later.
 */

const KEY_INFO = "hired.video/paid-media/v1";

class SecretsError extends Error {
  constructor(public readonly reason: "NOT_CONFIGURED" | "ENCRYPT_FAILED" | "DECRYPT_FAILED", message: string) {
    super(message);
    this.name = "SecretsError";
  }
}

function b64encode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function deriveKey(rawKey: string): Promise<CryptoKey> {
  const ikm = new TextEncoder().encode(rawKey);
  const hkdfKey = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0),
      info: new TextEncoder().encode(KEY_INFO),
    },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptSecret(env: { PAID_MEDIA_KMS_KEY?: string }, plaintext: string): Promise<string> {
  if (!env.PAID_MEDIA_KMS_KEY) {
    throw new SecretsError("NOT_CONFIGURED", "PAID_MEDIA_KMS_KEY env var not set");
  }
  try {
    const key = await deriveKey(env.PAID_MEDIA_KMS_KEY);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(plaintext),
    );
    return `${b64encode(iv)}.${b64encode(ct)}`;
  } catch (err) {
    throw new SecretsError("ENCRYPT_FAILED", err instanceof Error ? err.message : String(err));
  }
}

export async function decryptSecret(env: { PAID_MEDIA_KMS_KEY?: string }, ciphertext: string): Promise<string> {
  if (!env.PAID_MEDIA_KMS_KEY) {
    throw new SecretsError("NOT_CONFIGURED", "PAID_MEDIA_KMS_KEY env var not set");
  }
  const [ivB64, ctB64] = ciphertext.split(".");
  if (!ivB64 || !ctB64) {
    throw new SecretsError("DECRYPT_FAILED", "Malformed ciphertext (expected iv.ct)");
  }
  try {
    const key = await deriveKey(env.PAID_MEDIA_KMS_KEY);
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: b64decode(ivB64) },
      key,
      b64decode(ctB64),
    );
    return new TextDecoder().decode(pt);
  } catch (err) {
    throw new SecretsError("DECRYPT_FAILED", err instanceof Error ? err.message : String(err));
  }
}

export { SecretsError };
