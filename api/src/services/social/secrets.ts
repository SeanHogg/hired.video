/**
 * Envelope encryption for social connection token columns — thin adapter
 * over the shared crypto seam at services/crypto/secrets.ts (gap #1604),
 * exactly like services/paid-media/secrets.ts.
 *
 * Used for:
 *   - social_connections.access_token_enc / refresh_token_enc  (Lane B)
 *   - managed_accounts.access_token_enc / refresh_token_enc    (Lane A)
 *
 * NEVER call crypto.subtle from a route/service handler — always route
 * through encryptSecret / decryptSecret here so key derivation stays in
 * one place.
 */

import {
  encryptSecret as sharedEncryptSecret,
  decryptSecret as sharedDecryptSecret,
  SecretsError,
  type SecretsContext,
} from "../crypto/secrets.js";

// Stable HKDF info label — choose once, keep forever (rotating it would
// invalidate every stored token).
const INFO_LABEL = "hired.video/social/v1";

function context(env: { SOCIAL_KMS_KEY?: string; PAID_MEDIA_KMS_KEY?: string }): SecretsContext {
  // Prefer a dedicated key; fall back to the paid-media KMS key so a single
  // ops secret can cover both OAuth-token stores in early rollout.
  const masterKey = env.SOCIAL_KMS_KEY || env.PAID_MEDIA_KMS_KEY;
  if (!masterKey) {
    throw new SecretsError("NOT_CONFIGURED", "SOCIAL_KMS_KEY (or PAID_MEDIA_KMS_KEY) env var not set");
  }
  return { info: INFO_LABEL, masterKey };
}

export async function encryptSocialSecret(
  env: { SOCIAL_KMS_KEY?: string; PAID_MEDIA_KMS_KEY?: string },
  plaintext: string,
): Promise<string> {
  return sharedEncryptSecret(context(env), plaintext);
}

export async function decryptSocialSecret(
  env: { SOCIAL_KMS_KEY?: string; PAID_MEDIA_KMS_KEY?: string },
  ciphertext: string,
): Promise<string> {
  return sharedDecryptSecret(context(env), ciphertext);
}

export { SecretsError };
