/**
 * The ONE encryption scheme for provider_connections secrets (W3-C, 0600):
 * AES-256-GCM under CREDENTIALS_KMS_KEY, HKDF label
 * "hired.video/credentials/v1" (services/crypto/credential-columns.ts).
 *
 * Stored values come in two shapes:
 *   - `v1.aes-gcm.hkdf:…`      canonical ciphertext (every new write);
 *   - `legacy:<scheme>:<value>` copied by migration 0600 from a pre-merge
 *     store that SQL could not re-encrypt. `<scheme>` names the old store's
 *     key + HKDF label:
 *       plain       plaintext (a row 0548/0577's backfill never reached)
 *       paid_media  PAID_MEDIA_KMS_KEY,                   hired.video/paid-media/v1
 *       social      SOCIAL_KMS_KEY | PAID_MEDIA_KMS_KEY,   hired.video/social/v1
 *       email       EXTERNAL_EMAIL_TOKEN_KEY | JWT_SECRET, hired.video/external-email/refresh-token/v1
 *       workforce   WORKFORCE_KMS_KEY,                    hired.video/workforce-integration/v1
 *       payout      PAYOUT_TAX_ID_KEY (raw AES-GCM, services/payout/encryption.ts),
 *                   value `<b64 nonce>:<b64 ciphertext+tag>:<key id>`
 *
 * Reads decrypt either shape. `openAndResealSecret` additionally re-seals a
 * legacy value under the canonical key (lazy migration) whenever that key is
 * configured; scripts/backfill-credential-encryption.ts does the same for
 * every row at once. Once nothing legacy is left the legacy branch — and the
 * old keys — can be retired.
 */
import { getEnv } from "../../utils/env.js";
import { CREDENTIALS_KEY_ENV, credentialEncryptionConfigured, openCredential, sealCredential } from "../crypto/credential-columns.js";
import { decryptSecret, SecretsError, type SecretsContext } from "../crypto/secrets.js";
import { decryptTaxId } from "../payout/encryption.js";

export { SecretsError };

export const LEGACY_SECRET_PREFIX = "legacy:";

export const LEGACY_SECRET_SCHEMES = ["plain", "paid_media", "social", "email", "workforce", "payout"] as const;
export type LegacySecretScheme = (typeof LEGACY_SECRET_SCHEMES)[number];

/** The three secret columns of a provider connection. */
export type ConnectionSecretColumn = "accessTokenEnc" | "refreshTokenEnc" | "extraSecretEnc";

/** Old HKDF contexts — read-only, never used to encrypt. */
const LEGACY_HKDF: Record<Exclude<LegacySecretScheme, "plain" | "payout">, { info: string; key: () => string }> = {
  paid_media: { info: "hired.video/paid-media/v1", key: () => getEnv("PAID_MEDIA_KMS_KEY") },
  social: { info: "hired.video/social/v1", key: () => getEnv("SOCIAL_KMS_KEY") || getEnv("PAID_MEDIA_KMS_KEY") },
  email: { info: "hired.video/external-email/refresh-token/v1", key: () => getEnv("EXTERNAL_EMAIL_TOKEN_KEY") || getEnv("JWT_SECRET") },
  workforce: { info: "hired.video/workforce-integration/v1", key: () => getEnv("WORKFORCE_KMS_KEY") },
};

export function isLegacySecret(stored: string | null | undefined): boolean {
  return !!stored && stored.startsWith(LEGACY_SECRET_PREFIX);
}

/** Whether new secrets are encrypted in this environment. */
export function connectionEncryptionConfigured(masterKey = getEnv(CREDENTIALS_KEY_ENV)): boolean {
  return credentialEncryptionConfigured(masterKey);
}

export interface SealOptions {
  /**
   * Stores that wrote plaintext before CREDENTIALS_KMS_KEY existed (sign-in,
   * calendar, ATS, LMS, YouTube) keep working in an environment without the
   * key: the value is stored as `legacy:plain:` and re-sealed once the key is
   * set. Every other store (social, paid media, inbox, workforce, API keys)
   * was always encrypted and refuses to store plaintext.
   */
  allowPlaintextFallback?: boolean;
  masterKey?: string;
}

/** Encrypt a secret for a provider_connections column. "" / null → null.
 *  Throws SecretsError("NOT_CONFIGURED") when there is no key and the store
 *  does not allow the plaintext fallback. */
export async function sealConnectionSecret(
  plaintext: string | null | undefined,
  opts: SealOptions = {},
): Promise<string | null> {
  if (!plaintext) return null;
  const sealed = await sealCredential(plaintext, opts.masterKey ?? getEnv(CREDENTIALS_KEY_ENV));
  if (sealed.enc) return sealed.enc;
  if (opts.allowPlaintextFallback) return `${LEGACY_SECRET_PREFIX}plain:${plaintext}`;
  throw new SecretsError("NOT_CONFIGURED", `${CREDENTIALS_KEY_ENV} is not set — cannot store a connection secret`);
}

function splitLegacy(stored: string): { scheme: LegacySecretScheme; value: string } {
  const body = stored.slice(LEGACY_SECRET_PREFIX.length);
  const sep = body.indexOf(":");
  const scheme = (sep < 0 ? body : body.slice(0, sep)) as LegacySecretScheme;
  if (!(LEGACY_SECRET_SCHEMES as readonly string[]).includes(scheme)) {
    throw new SecretsError("MALFORMED", `Unknown legacy secret scheme "${scheme}"`);
  }
  return { scheme, value: sep < 0 ? "" : body.slice(sep + 1) };
}

async function openLegacy(scheme: LegacySecretScheme, value: string): Promise<string> {
  if (scheme === "plain") return value;
  if (scheme === "payout") {
    const [nonce, ciphertext] = value.split(":");
    if (!nonce || !ciphertext) throw new SecretsError("MALFORMED", "payout secret missing nonce or ciphertext");
    try {
      return await decryptTaxId(Buffer.from(ciphertext, "base64"), Buffer.from(nonce, "base64"), {
        PAYOUT_TAX_ID_KEY: getEnv("PAYOUT_TAX_ID_KEY"),
        PAYOUT_TAX_ID_KEY_ID: getEnv("PAYOUT_TAX_ID_KEY_ID") || undefined,
      });
    } catch (err) {
      throw new SecretsError("DECRYPT_FAILED", err instanceof Error ? err.message : String(err));
    }
  }
  const hkdf = LEGACY_HKDF[scheme];
  const masterKey = hkdf.key();
  if (!masterKey) throw new SecretsError("NOT_CONFIGURED", `The legacy ${scheme} key is not set`);
  const ctx: SecretsContext = { info: hkdf.info, masterKey };
  return decryptSecret(ctx, value);
}

/** Decrypt a stored provider_connections secret (canonical or legacy). */
export async function openConnectionSecret(
  stored: string | null | undefined,
  masterKey = getEnv(CREDENTIALS_KEY_ENV),
): Promise<string | null> {
  if (!stored) return null;
  if (isLegacySecret(stored)) {
    const { scheme, value } = splitLegacy(stored);
    return openLegacy(scheme, value);
  }
  return openCredential(stored, null, masterKey);
}

/**
 * Decrypt a stored secret and, when it is still in a legacy scheme and the
 * canonical key is configured, re-seal it and hand the new stored value to
 * `persist` (lazy re-seal on read). A failed re-seal never fails the read.
 */
export async function openAndResealSecret(
  stored: string | null | undefined,
  persist: (resealed: string) => Promise<void>,
  masterKey = getEnv(CREDENTIALS_KEY_ENV),
): Promise<string | null> {
  const plaintext = await openConnectionSecret(stored, masterKey);
  if (plaintext && isLegacySecret(stored) && connectionEncryptionConfigured(masterKey)) {
    try {
      const resealed = await sealConnectionSecret(plaintext, { masterKey });
      if (resealed) await persist(resealed);
    } catch {
      // Best effort: the next read (or the backfill script) retries.
    }
  }
  return plaintext;
}
