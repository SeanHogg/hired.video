/**
 * Symmetric encryption for OAuth refresh tokens at rest — thin adapter
 * over the shared seam at [services/crypto/secrets.ts](../crypto/secrets.ts).
 *
 * Pre-#1604 this file held its own AES-GCM + HKDF implementation that
 * emitted a `hex(iv):hex(ct)` text format. That implementation moved to
 * the shared module; this file is now responsible only for:
 *   - holding the consumer-specific HKDF `info` label (kept identical
 *     to the pre-#1604 constant so legacy rows decrypt cleanly)
 *   - sourcing the master key from the right env var with the same
 *     fallback chain (`EXTERNAL_EMAIL_TOKEN_KEY` → `JWT_SECRET`).
 *
 * Plaintext refresh tokens never touch storage — `external_email_accounts.
 * oauth_refresh_token_enc` always holds the encrypted form.
 */

import { encryptSecret, decryptSecret, type SecretsContext } from "../crypto/secrets.js";
import { getEnv } from "../../utils/env.js";

// The HKDF info label MUST stay byte-identical to the pre-#1604 value so
// that legacy `hex(iv):hex(ct)` rows derive the same AES key. Don't edit
// this string — invalidate all existing rows if you do.
const INFO_LABEL = "hired.video/external-email/refresh-token/v1";


function context(): SecretsContext {
  const explicit = getEnv("EXTERNAL_EMAIL_TOKEN_KEY");
  const seed = explicit || getEnv("JWT_SECRET");
  if (!seed) throw new Error("EXTERNAL_EMAIL_TOKEN_KEY or JWT_SECRET must be set");
  return { info: INFO_LABEL, masterKey: seed };
}

export async function encryptToken(plaintext: string): Promise<string> {
  return encryptSecret(context(), plaintext);
}

export async function decryptToken(encoded: string): Promise<string> {
  return decryptSecret(context(), encoded);
}
