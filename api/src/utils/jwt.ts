import { SignJWT } from "jose";

/**
 * Returns the configured JWT secret.
 * In non-production environments falls back to "dev-secret" so local dev works
 * without env vars. In production throws immediately — a missing secret is a
 * misconfiguration that should crash loudly rather than silently accept forged tokens.
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET || (globalThis as any).__ENV?.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("[auth] JWT_SECRET is not configured — refusing to start with an insecure fallback");
    }
    return "dev-secret";
  }
  return secret;
}

/**
 * Returns the configured JWT secret, or null if not set.
 * Use in optional-auth middleware where the correct behaviour when unconfigured
 * is to skip auth entirely rather than error.
 */
export function getJwtSecretOptional(): string | null {
  return process.env.JWT_SECRET || (globalThis as any).__ENV?.JWT_SECRET || null;
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
