/**
 * Passkey (FIDO2/WebAuthn) use cases behind /api/auth/passkey:
 *   • beginPasskeyRegistration / completePasskeyRegistration
 *   • beginPasskeyLogin / completePasskeyLogin (resident-key flow → JWT)
 *   • listPasskeys / deletePasskey
 *
 * Challenges live in WebauthnChallengesRepository; credentials in
 * AuthTokensRepository. Failures throw DomainError (status + code are the
 * wire contract the global error handler emits).
 */

import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { logger } from "../../lib/logger.js";
import { AuthTokensRepository } from "../../repositories/authTokensRepository.js";
import { findUserContactById } from "../../repositories/authFlowRepository.js";
import { UsersRepository } from "../../repositories/usersRepository.js";
import { WebauthnChallengesRepository, type WebauthnCeremony } from "../../repositories/webauthnChallengesRepository.js";
import { base64UrlEncode, base64UrlToBytes, randomBytes } from "../../utils/crypto.js";
import { getJwtSecret } from "../../utils/jwt.js";
import { issueJwt } from "./jwt.js";
import { markUserLogin } from "./loginStamp.js";
import { createSession } from "./session-lifecycle.js";
import {
  extractAttestationAuthData,
  importCOSEPublicKey,
  isBackedUp,
  readAttestedCredential,
  readSignCount,
  rpIdHashMatches,
  userPresent,
  verifyES256Signature,
} from "./webauthnCrypto.js";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_ORIGIN = "https://hired.video";

export interface PasskeyClient {
  /** The request's Origin header (null when absent). */
  origin: string | null;
  ipAddress: string | null;
  userAgent: string | null;
}

function verificationFailed(message: string, status = 400): DomainError {
  return new DomainError(status, "VERIFICATION_FAILED", message);
}

function resolveRp(originHeader: string | null): { origin: string; rpId: string } {
  const origin = originHeader ?? DEFAULT_ORIGIN;
  let rpId: string;
  try { rpId = new URL(origin).hostname; } catch { rpId = "hired.video"; }
  return { origin, rpId };
}

function originAllowed(clientOrigin: unknown, origin: string): boolean {
  return clientOrigin === origin || String(clientOrigin).endsWith(".hired.video");
}

function parseClientData(b64: string): { bytes: Uint8Array; data: Record<string, unknown> } {
  const bytes = base64UrlToBytes(b64);
  return { bytes, data: JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown> };
}

/** Sweep expired challenges, then store a fresh one for this ceremony. */
async function issueChallenge(userId: string | null, type: WebauthnCeremony): Promise<string> {
  const challenges = new WebauthnChallengesRepository(getDb());
  await challenges.deleteExpired(new Date());
  const challenge = base64UrlEncode(randomBytes(32));
  await challenges.insert({ userId, challenge, type, expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS) });
  return challenge;
}

/** Find + consume a ceremony challenge; throws when missing or expired. */
async function consumeChallenge(challenge: string, type: WebauthnCeremony, userId?: string): Promise<void> {
  const challenges = new WebauthnChallengesRepository(getDb());
  const row = await challenges.findByChallenge(challenge, type, userId);
  if (!row || new Date(row.expiresAt) < new Date()) throw verificationFailed("Challenge invalid or expired");
  await challenges.deleteById(row.id);
}

// ─── Registration ────────────────────────────────────────────────────────────

export async function beginPasskeyRegistration(userId: string, client: PasskeyClient) {
  const { rpId } = resolveRp(client.origin);
  const challenge = await issueChallenge(userId, "registration");
  const user = await findUserContactById(getDb(), userId);

  return {
    challenge,
    rp: { id: rpId, name: "hired.video" },
    user: {
      id: base64UrlEncode(userId),
      name: user?.email ?? userId,
      displayName: user?.name ?? "User",
    },
    pubKeyCredParams: [
      { alg: -7, type: "public-key" },   // ES256
      { alg: -257, type: "public-key" }, // RS256
    ],
    timeout: 300_000,
    attestation: "none",
    authenticatorSelection: {
      userVerification: "preferred",
      residentKey: "preferred",
    },
  };
}

export async function completePasskeyRegistration(
  userId: string,
  input: { response: { clientDataJSON: string; attestationObject: string }; name: string },
  client: PasskeyClient,
): Promise<{ credentialId: string; name: string }> {
  const { origin, rpId } = resolveRp(client.origin);

  const clientData = parseClientData(input.response.clientDataJSON).data;
  if (clientData.type !== "webauthn.create") throw verificationFailed("Invalid ceremony type");

  await consumeChallenge(clientData.challenge as string, "registration", userId);

  if (!originAllowed(clientData.origin, origin)) throw verificationFailed("Origin mismatch");

  const authData = extractAttestationAuthData(base64UrlToBytes(input.response.attestationObject));
  if (!(await rpIdHashMatches(authData, rpId))) throw verificationFailed("RP ID hash mismatch");
  if (!userPresent(authData)) throw verificationFailed("User not present");

  const { credentialId, publicKey } = readAttestedCredential(authData);
  await new AuthTokensRepository(getDb()).insertPasskey({
    userId,
    credentialId,
    publicKey,
    algorithm: -7, // ES256
    signCount: readSignCount(authData),
    name: input.name,
    isBackedUp: isBackedUp(authData),
  });

  return { credentialId, name: input.name };
}

// ─── Authentication ──────────────────────────────────────────────────────────

export async function beginPasskeyLogin(client: PasskeyClient) {
  const { rpId } = resolveRp(client.origin);
  const challenge = await issueChallenge(null, "authentication");
  return {
    challenge,
    rpId,
    timeout: 300_000,
    userVerification: "preferred",
    allowCredentials: [], // empty = resident key (passkey) flow — browser picks
  };
}

export async function completePasskeyLogin(
  input: { id: string; response: { clientDataJSON: string; authenticatorData: string; signature: string } },
  client: PasskeyClient,
): Promise<{ token: string; user: { id: string; email: string; name: string; role: string } }> {
  const db = getDb();
  const { origin, rpId } = resolveRp(client.origin);

  const { bytes: clientDataBytes, data: clientData } = parseClientData(input.response.clientDataJSON);
  if (clientData.type !== "webauthn.get") throw verificationFailed("Invalid ceremony type");

  await consumeChallenge(clientData.challenge as string, "authentication");

  const credentials = new AuthTokensRepository(db);
  const credentialId = input.id;
  const cred = await credentials.findPasskeyByCredentialId(credentialId);
  if (!cred) throw new DomainError(404, "NOT_FOUND", "Credential not found");

  if (!originAllowed(clientData.origin, origin)) throw verificationFailed("Origin mismatch");

  const authData = base64UrlToBytes(input.response.authenticatorData);
  if (!(await rpIdHashMatches(authData, rpId))) throw verificationFailed("RP ID hash mismatch");
  if (!userPresent(authData)) throw verificationFailed("User not present");

  let publicKey: CryptoKey;
  try {
    publicKey = await importCOSEPublicKey(base64UrlToBytes(cred.publicKey));
  } catch {
    throw verificationFailed("Could not import public key");
  }

  const valid = await verifyES256Signature(publicKey, authData, clientDataBytes, base64UrlToBytes(input.response.signature));
  if (!valid) throw verificationFailed("Signature verification failed", 401);

  const newCount = readSignCount(authData);
  if (cred.signCount > 0 && newCount <= cred.signCount) {
    // Potential cloned authenticator — log but don't block (could be a synced passkey)
    logger.warn("[passkey] sign count regression", { credentialId, previousCount: cred.signCount, newCount });
  }
  await credentials.recordPasskeyUse(cred.id, newCount, new Date());

  const user = await new UsersRepository(db).findById(cred.userId);
  if (!user) throw new DomainError(404, "NOT_FOUND", "User not found");
  // Same gate as every other sign-in path: a disabled/suspended account
  // must not mint a token just because it still holds a passkey.
  if (!user.isActive || user.isSuspended) {
    throw new DomainError(401, "UNAUTHORIZED", "Account not found or disabled");
  }

  // Session-bound JWT with the standard claims (roles/emailVerified/sid) —
  // the auth middleware reads `roles`, and the sessions page lists `sid`.
  const { session } = await createSession({ db, userId: user.id, ipAddress: client.ipAddress, userAgent: client.userAgent });
  const token = await issueJwt(
    {
      sub: user.id,
      email: user.email,
      roles: [user.role],
      emailVerified: !!user.emailVerified,
      mustChangePassword: !!user.mustChangePassword,
      sid: session.id,
    },
    getJwtSecret(),
  );
  await markUserLogin(db, user.id);

  return { token, user: { id: user.id, email: user.email, name: user.name, role: user.role } };
}

// ─── Credential management ───────────────────────────────────────────────────

export async function listPasskeys(userId: string) {
  const rows = await new AuthTokensRepository(getDb()).findPasskeysForUser(userId);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    isBackedUp: r.isBackedUp,
    lastUsedAt: r.lastUsedAt,
    createdAt: r.createdAt,
  }));
}

export async function deletePasskey(userId: string, credentialRowId: string): Promise<void> {
  await new AuthTokensRepository(getDb()).deletePasskey(credentialRowId, userId);
}
