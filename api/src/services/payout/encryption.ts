/**
 * AES-256-GCM envelope encryption for tax IDs (SSN / EIN / ITIN / foreign TIN).
 *
 * Replaces the plaintext `payout_profiles.tax_id_encrypted` placeholder
 * with a proper ciphertext + per-row 12-byte nonce. The key is loaded from
 * the `PAYOUT_TAX_ID_KEY` env secret as a 32-byte base64 value; the
 * `PAYOUT_TAX_ID_KEY_ID` env names the active key version so a rotation
 * can decrypt rows wrapped under the previous key.
 *
 * Why GCM over CBC: authenticated encryption — a tampered ciphertext fails
 * the GCM tag check on decrypt rather than producing garbled plaintext we'd
 * silently store. The 12-byte nonce + 16-byte tag are persisted alongside
 * the ciphertext per row (nonce in tax_id_nonce, tag appended to the
 * ciphertext buffer).
 *
 * Rotation: when PAYOUT_TAX_ID_KEY rotates, set PAYOUT_TAX_ID_KEY_ID to
 * the new version label and ship a separate backfill that reads every row,
 * decrypts with the old key (still readable via a versioned key registry),
 * and re-encrypts. The kms_key_id column lets the backfill skip rows
 * already wrapped under the new key.
 */

const KEY_BYTES = 32;     // AES-256
const NONCE_BYTES = 12;   // GCM standard
const TAG_BYTES = 16;     // GCM tag length

interface EncryptedTaxId {
  ciphertext: Buffer;   // raw GCM ciphertext + 16-byte auth tag appended
  nonce: Buffer;        // 12 bytes
  kmsKeyId: string;     // active key version label
}

function loadActiveKey(env: Record<string, string | undefined>): { key: Buffer; keyId: string } {
  const raw = env.PAYOUT_TAX_ID_KEY;
  if (!raw) {
    throw new Error("PAYOUT_TAX_ID_KEY is not configured — cannot encrypt tax IDs");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `PAYOUT_TAX_ID_KEY must be a 32-byte base64 value (got ${key.length} bytes)`,
    );
  }
  const keyId = env.PAYOUT_TAX_ID_KEY_ID ?? "v1";
  return { key, keyId };
}

export async function encryptTaxId(
  plaintext: string,
  env: Record<string, string | undefined>,
): Promise<EncryptedTaxId> {
  const { key, keyId } = loadActiveKey(env);
  const { createCipheriv, randomBytes } = await import("node:crypto");

  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext: Buffer.concat([enc, tag]),
    nonce,
    kmsKeyId: keyId,
  };
}

export async function decryptTaxId(
  ciphertext: Buffer,
  nonce: Buffer,
  env: Record<string, string | undefined>,
): Promise<string> {
  const { key } = loadActiveKey(env);
  const { createDecipheriv } = await import("node:crypto");

  if (ciphertext.length < TAG_BYTES) {
    throw new Error("Ciphertext too short to contain a GCM tag");
  }
  if (nonce.length !== NONCE_BYTES) {
    throw new Error(`Nonce must be ${NONCE_BYTES} bytes (got ${nonce.length})`);
  }

  const enc = ciphertext.subarray(0, ciphertext.length - TAG_BYTES);
  const tag = ciphertext.subarray(ciphertext.length - TAG_BYTES);

  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

/**
 * Generate a fresh 32-byte base64-encoded key. CLI helper for the runbook
 * (which is itself tracked in the Gap Register as a missing artifact).
 */
export async function generateTaxIdKey(): Promise<string> {
  const { randomBytes } = await import("node:crypto");
  return randomBytes(KEY_BYTES).toString("base64");
}
