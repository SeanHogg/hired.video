import { SignJWT } from "jose";
import type { JwtPayload } from "../../types/index.js";

// ---------------------------------------------------------------------------
// JWT issuance — tiny wrapper so tests can assert the payload without
// re-implementing sign/verify.
// ---------------------------------------------------------------------------

export async function issueJwt(payload: Omit<JwtPayload, "iat" | "exp">, secret: string): Promise<string> {
  const secretKey = new TextEncoder().encode(secret);
  const claims: Record<string, unknown> = {
    email: payload.email,
    roles: payload.roles,
    emailVerified: payload.emailVerified,
    mustChangePassword: payload.mustChangePassword,
  };
  if (payload.sid) claims.sid = payload.sid;
  if (payload.guest) claims.guest = true;
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    // Guests have no password to sign back in with — their token is the
    // only key to their work until they claim it, so it lives longer.
    .setExpirationTime(payload.guest ? GUEST_TOKEN_TTL : "7d")
    .sign(secretKey);
}

/** Guest JWT lifetime; matches the stale-guest sweep window. */
export const GUEST_TOKEN_TTL = "30d";
