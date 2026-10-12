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

type SocialKmsEnv = { SOCIAL_KMS_KEY?: string; PAID_MEDIA_KMS_KEY?: string };

// Prefer a dedicated key; fall back to the paid-media KMS key so a single
// ops secret can cover both OAuth-token stores in early rollout.
const masterKeyOf = (env: SocialKmsEnv): string | undefined => env.SOCIAL_KMS_KEY || env.PAID_MEDIA_KMS_KEY;

/** Whether tokens can be stored at all — checked BEFORE sending anyone through
 *  a consent screen whose result we'd then be unable to persist. */
export function isSocialEncryptionConfigured(env: SocialKmsEnv): boolean {
  return !!masterKeyOf(env);
}

function context(env: SocialKmsEnv): SecretsContext {
  const masterKey = masterKeyOf(env);
  if (!masterKey) {
    throw new SecretsError("NOT_CONFIGURED", "SOCIAL_KMS_KEY (or PAID_MEDIA_KMS_KEY) env var not set");
  }
  return { info: INFO_LABEL, masterKey };
}

export async function encryptSocialSecret(
  env: SocialKmsEnv,
  plaintext: string,
): Promise<string> {
  return sharedEncryptSecret(context(env), plaintext);
}

export async function decryptSocialSecret(
  env: SocialKmsEnv,
  ciphertext: string,
): Promise<string> {
  return sharedDecryptSecret(context(env), ciphertext);
}

export { SecretsError };
