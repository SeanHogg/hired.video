import { SignJWT } from "jose";
import { isProduction } from "./runtime-env.js";

/** The ONLY place JWT_SECRET is read out of the environment. */
function readJwtSecret(): string | null {
  const secret = process.env.JWT_SECRET || (globalThis as any).__ENV?.JWT_SECRET;
  return typeof secret === "string" && secret.length > 0 ? secret : null;
}

/**
 * Thrown when a token must be signed or verified but no secret is configured.
 * Distinct from a generic Error so the error handler can report a
 * misconfiguration rather than leaking a crypto-layer message.
 *
 * Before this existed, callers each invented their own missing-secret
 * behaviour — `""`, `"dev-secret"`, `"dev-secret-not-for-prod"` — and an
 * empty string reached `crypto.subtle.importKey`, which surfaced as the
 * useless 500 `Imported HMAC key length (0) must be a non-zero value…`
 * on every social login after the 2026-10-03 account migration.
 */
export class JwtSecretMissingError extends Error {
  constructor() {
    super("[auth] JWT_SECRET is not configured — refusing to sign or verify with an insecure fallback");
    this.name = "JwtSecretMissingError";
  }
}

/**
 * The configured JWT secret, for any caller that MUST have one.
 * Throws in production rather than falling back, so a missing secret is a
 * loud misconfiguration instead of forgeable tokens signed with a constant
 * that is published in this repo. Explicitly non-production environments
 * (APP_ENV / NODE_ENV = dev|test) keep the "dev-secret" convenience.
 */
export function getJwtSecret(): string {
  const secret = readJwtSecret();
  if (secret) return secret;
  if (isProduction()) throw new JwtSecretMissingError();
  return "dev-secret";
}

/**
 * The configured JWT secret, or null if unset — no dev fallback.
 * Use where the correct behaviour when unconfigured is to skip auth or omit
 * a signed artefact entirely rather than to error.
 */
export function getJwtSecretOptional(): string | null {
  return readJwtSecret();
}

export interface EmulationTokenPayload {
  targetUserId: string;
  targetEmail: string;
  targetRole: string;
  adminId: string;
  sessionId?: string;
  expiresAt: Date;
}

/**
 * Builds a signed emulation JWT for X-Emulation-Token.
 * Returns both the signed token string and the jti used.
 */
export async function buildEmulationToken(payload: EmulationTokenPayload): Promise<{ token: string; jti: string }> {
  const secret = new TextEncoder().encode(getJwtSecret());
  const jti = crypto.randomUUID();

  const token = await new SignJWT({
    email: payload.targetEmail,
    roles: [payload.targetRole],
    emailVerified: true,
    mustChangePassword: false,
    emu: true,
    emu_by: payload.adminId,
    emu_sid: payload.sessionId,
    emu_readonly: true,
    jti,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.targetUserId)
    .setIssuedAt()
    .setExpirationTime(payload.expiresAt)
    .setJti(jti)
    .sign(secret);

  return { token, jti };
}
