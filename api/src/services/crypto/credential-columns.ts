/**
 * At-rest encryption for third-party credentials stored in plain `text`
 * columns (W1-D, 2026-10-17): ats_connections.api_key, calendar_connections,
 * lms_connectors, oauth_accounts and youtube_accounts access/refresh tokens.
 *
 * Each such column has an `*_enc` sibling. Writers call `sealCredential` and
 * store BOTH halves it returns; readers call `openCredential(enc, plain)`.
 *
 *   - CREDENTIALS_KMS_KEY set   → { enc: ciphertext, plain: null }
 *   - CREDENTIALS_KMS_KEY unset → { enc: null, plain: plaintext } (legacy
 *     behaviour, so connecting an account keeps working in an environment
 *     that has no key yet)
 *
 * Reads prefer `enc` and fall back to the plaintext column only for rows
 * written before the key existed; scripts/backfill-credential-encryption.ts
 * moves those rows over, and migration 0549 (owner-gated) clears what is
 * left. Key derivation lives in the shared seam services/crypto/secrets.ts.
 *
 * The key name is fixed on purpose (no fallback chain): a ciphertext only
 * decrypts under the key that wrote it, so the key a deployment uses must
 * never silently change.
 */
import { decryptSecret, encryptSecret, SecretsError, type SecretsContext } from "./secrets.js";
import { getEnv } from "../../utils/env.js";

/** Stable HKDF info label — choose once, keep forever. */
const INFO_LABEL = "hired.video/credentials/v1";
export const CREDENTIALS_KEY_ENV = "CREDENTIALS_KMS_KEY";

export interface SealedCredential {
  /** Value for the `*_enc` column. */
  enc: string | null;
  /** Value for the legacy plaintext column (null whenever `enc` is set). */
  plain: string | null;
}

function context(masterKey: string): SecretsContext {
  return { info: INFO_LABEL, masterKey };
}

/** Whether new writes are encrypted in this environment. */
export function credentialEncryptionConfigured(masterKey = getEnv(CREDENTIALS_KEY_ENV)): boolean {
  return !!masterKey;
}

/** Encrypt a credential for storage. `null`/`undefined`/"" stay null. */
export async function sealCredential(
  plaintext: string | null | undefined,
  masterKey = getEnv(CREDENTIALS_KEY_ENV),
): Promise<SealedCredential> {
  if (!plaintext) return { enc: null, plain: null };
  if (!masterKey) return { enc: null, plain: plaintext };
  return { enc: await encryptSecret(context(masterKey), plaintext), plain: null };
}

/**
 * Read a credential: decrypt `enc` when present, else the legacy plaintext.
 * Throws SecretsError("NOT_CONFIGURED") when a row is encrypted but this
 * environment has no key — a configuration error, never silently "no token".
 */
export async function openCredential(
  enc: string | null | undefined,
  plain: string | null | undefined,
  masterKey = getEnv(CREDENTIALS_KEY_ENV),
): Promise<string | null> {
  if (enc) {
    if (!masterKey) throw new SecretsError("NOT_CONFIGURED", `${CREDENTIALS_KEY_ENV} is not set but the credential is encrypted`);
    return decryptSecret(context(masterKey), enc);
  }
  return plain ?? null;
}
