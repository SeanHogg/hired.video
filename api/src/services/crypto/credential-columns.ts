/**
 * The canonical cipher for third-party credentials: AES-256-GCM under
 * CREDENTIALS_KMS_KEY, HKDF label "hired.video/credentials/v1".
 *
 * Since W3-C (migration 0600) every credential lives in provider_connections
 * and is sealed / opened through services/provider-connections/
 * connection-secrets.ts, which builds on these two primitives:
 *
 *   - CREDENTIALS_KMS_KEY set   → sealCredential → { enc: ciphertext, plain: null }
 *   - CREDENTIALS_KMS_KEY unset → { enc: null, plain: plaintext } (the caller
 *     decides whether a plaintext fallback is allowed)
 *
 * `openCredential(enc, plain)` prefers `enc`. Key derivation lives in the
 * shared seam services/crypto/secrets.ts.
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
