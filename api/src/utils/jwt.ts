import { SignJWT } from "jose";

export function getJwtSecret(): string {
  return process.env.JWT_SECRET || (globalThis as any).__ENV?.JWT_SECRET || "dev-secret";
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
