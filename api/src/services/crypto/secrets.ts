/**
 * Shared envelope-style symmetric encryption for at-rest secrets.
 *
 * Gap #1604 — single seam that replaces:
 *   - services/email-integration/encryption.ts (encryptToken/decryptToken)
 *   - services/paid-media/secrets.ts (encryptSecret/decryptSecret)
 *
 * Both pre-existing modules did the same envelope-encryption job with
 * AES-256-GCM via Web Crypto + HKDF-SHA-256 key derivation, but emitted
 * DIFFERENT wire formats and lived in two places — a textbook DRY
 * violation. This module replaces both. The per-service wrappers remain
 * only as thin adapters that hold the consumer-specific HKDF `info`
 * label + the master-key source (env var name); they delegate every
 * primitive to here.
 *
 * Wire format (new writes):
 *   v1.aes-gcm.hkdf:<base64(iv)>.<base64(ciphertext+tag)>
 *
 * Decrypt tolerates three formats during the backfill window so existing
 * rows keep working without re-encryption:
 *   1. NEW          v1.aes-gcm.hkdf:b64iv.b64ct
 *   2. Legacy A     b64iv.b64ct                         (old paid-media)
 *   3. Legacy B     hexiv:hexct                         (old email-integration)
 *
 * Writes ALWAYS emit the new prefixed format — the legacy formats die
 * naturally as rows get re-encrypted on next OAuth refresh / token rotation.
 *
 * NOT covered by this module — and deliberately so:
 *   - services/payout/encryption.ts wraps tax IDs into (bytea ciphertext +
 *     bytea nonce + varchar kms_key_id) across THREE columns, with
 *     versioned key rotation built in. Different storage shape, different
 *     threat model (PII, not OAuth tokens). Routing payout through this
 *     module would force a schema change and lose the per-row key version.
 */

const NEW_PREFIX = "v1.aes-gcm.hkdf:";

export interface SecretsContext {
  /** HKDF "info" label. Must match the consumer's original module so
   *  legacy ciphertexts produced under that label decrypt cleanly.
   *  Examples:
   *    - "hired.video/external-email/refresh-token/v1"
   *    - "hired.video/paid-media/v1"
   *  Adding a new consumer means choosing a fresh stable label and
   *  keeping it forever (rotating the label invalidates every row). */
  info: string;
  /** Master key string from env. The HKDF chain derives the actual
   *  AES key — never use this string as the key directly. */
  masterKey: string;
}

export class SecretsError extends Error {
  constructor(
    public readonly reason: "NOT_CONFIGURED" | "ENCRYPT_FAILED" | "DECRYPT_FAILED" | "MALFORMED",
    message: string,
  ) {
    super(message);
    this.name = "SecretsError";
  }
}

function assertConfigured(ctx: SecretsContext): void {
  if (!ctx.masterKey) {
    throw new SecretsError("NOT_CONFIGURED", "Secrets master key is empty");
  }
  if (!ctx.info) {
    throw new SecretsError("NOT_CONFIGURED", "Secrets info label is empty");
  }
}

async function deriveKey(ctx: SecretsContext): Promise<CryptoKey> {
  const ikm = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(ctx.masterKey),
    "HKDF",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0),
      info: new TextEncoder().encode(ctx.info),
    },
    ikm,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
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

function hexDecode(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** Encrypt a plaintext into the v1 prefixed format. */
export async function encryptSecret(ctx: SecretsContext, plaintext: string): Promise<string> {
  assertConfigured(ctx);
  try {
    const key = await deriveKey(ctx);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(plaintext),
    );
    return `${NEW_PREFIX}${b64encode(iv)}.${b64encode(ct)}`;
  } catch (err) {
    throw new SecretsError(
      "ENCRYPT_FAILED",
      err instanceof Error ? err.message : String(err),
    );
  }
}

/**
 * Decrypt a stored ciphertext. Auto-detects the format:
 *   - NEW          v1.aes-gcm.hkdf:b64iv.b64ct
 *   - Legacy A     b64iv.b64ct                    (paid-media pre-#1604)
 *   - Legacy B     hexiv:hexct                    (email pre-#1604)
 */
export async function decryptSecret(ctx: SecretsContext, encoded: string): Promise<string> {
  assertConfigured(ctx);

  let ivBytes: Uint8Array;
  let ctBytes: Uint8Array;

  if (encoded.startsWith(NEW_PREFIX)) {
    const body = encoded.slice(NEW_PREFIX.length);
    const [ivPart, ctPart] = body.split(".");
    if (!ivPart || !ctPart) {
      throw new SecretsError("MALFORMED", "v1 ciphertext missing iv or ciphertext segment");
    }
    ivBytes = b64decode(ivPart);
    ctBytes = b64decode(ctPart);
  } else if (encoded.includes(":")) {
    // Legacy email-integration format: hexIv:hexCt.
    const [ivHex, ctHex] = encoded.split(":");
    if (!ivHex || !ctHex) {
      throw new SecretsError("MALFORMED", "Legacy hex ciphertext missing segment");
    }
    ivBytes = hexDecode(ivHex);
    ctBytes = hexDecode(ctHex);
  } else if (encoded.includes(".")) {
    // Legacy paid-media format: b64Iv.b64Ct.
    const [ivB64, ctB64] = encoded.split(".");
    if (!ivB64 || !ctB64) {
      throw new SecretsError("MALFORMED", "Legacy b64 ciphertext missing segment");
    }
    ivBytes = b64decode(ivB64);
    ctBytes = b64decode(ctB64);
  } else {
    throw new SecretsError(
      "MALFORMED",
      "Ciphertext does not match v1 or any known legacy format",
    );
  }

  try {
    const key = await deriveKey(ctx);
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ivBytes },
      key,
      ctBytes,
    );
    return new TextDecoder().decode(pt);
  } catch (err) {
    throw new SecretsError(
      "DECRYPT_FAILED",
      err instanceof Error ? err.message : String(err),
    );
  }
}

/**
 * Detect whether a stored ciphertext has been migrated to the v1 format.
 * Useful for migrations / backfill jobs that want to opportunistically
 * re-encrypt legacy rows on next read.
 */
export function isMigrated(encoded: string): boolean {
  return encoded.startsWith(NEW_PREFIX);
}
