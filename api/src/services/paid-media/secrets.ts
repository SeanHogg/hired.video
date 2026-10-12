/**
 * Envelope encryption for paid-media credential columns — thin adapter
 * over the shared seam at [services/crypto/secrets.ts](../crypto/secrets.ts).
 *
 * Pre-#1604 this file held its own AES-GCM + HKDF implementation that
 * emitted a `b64(iv).b64(ct)` text format. That implementation moved to
 * the shared module; this file now holds only the consumer-specific
 * HKDF `info` label + env-var binding.
 *
 * Used for:
 *   - paid_media_connections.access_token_enc / refresh_token_enc
 *   - paid_media_pixels.*_token_enc
 *
 * NEVER call crypto.subtle from a route handler — always route through
 * encryptSecret / decryptSecret here so the key derivation stays in one
 * place and audit logging can hook the seam later.
 */

import {
  encryptSecret as sharedEncryptSecret,
  decryptSecret as sharedDecryptSecret,
  SecretsError,
  type SecretsContext,
} from "../crypto/secrets.js";

// The HKDF info label MUST stay byte-identical to the pre-#1604 value so
// that legacy `b64(iv).b64(ct)` rows derive the same AES key.
const INFO_LABEL = "hired.video/paid-media/v1";

function context(env: { PAID_MEDIA_KMS_KEY?: string }): SecretsContext {
  if (!env.PAID_MEDIA_KMS_KEY) {
    throw new SecretsError("NOT_CONFIGURED", "PAID_MEDIA_KMS_KEY env var not set");
  }
  return { info: INFO_LABEL, masterKey: env.PAID_MEDIA_KMS_KEY };
}

export async function encryptSecret(
  env: { PAID_MEDIA_KMS_KEY?: string },
  plaintext: string,
): Promise<string> {
  return sharedEncryptSecret(context(env), plaintext);
}

export async function decryptSecret(
  env: { PAID_MEDIA_KMS_KEY?: string },
  ciphertext: string,
): Promise<string> {
  return sharedDecryptSecret(context(env), ciphertext);
}

export { SecretsError };
