import { jwtVerify } from "jose";
import type { Context, MiddlewareHandler } from "hono";
import { error, type JwtPayload, type AppEnv } from "../types/index.js";
import { getJwtSecret, getJwtSecretOptional } from "../utils/jwt.js";
import { isSuperAdmin } from "./superAdmin.js";
import { getDb } from "../db/index.js";
import { loadSessionForJwt } from "../services/auth/sessions.js";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function parseJwtPayload(payload: Record<string, unknown>): JwtPayload {
  return {
    sub: payload.sub as string,
    email: payload["email"] as string,
    roles: (payload["roles"] as string[]) ?? [],
    emailVerified: (payload["emailVerified"] as boolean) ?? false,
    mustChangePassword: (payload["mustChangePassword"] as boolean) ?? false,
    companyId: payload["companyId"] as string | undefined,
    isSuperAdmin: (payload["isSuperAdmin"] as boolean) ?? false,
    sid: payload["sid"] as string | undefined,
    guest: (payload["guest"] as boolean) ?? false,
    // Emulation claims
    emu: (payload["emu"] as boolean) ?? false,
    emuBy: payload["emu_by"] as string | undefined,
    emuSid: payload["emu_sid"] as string | undefined,
    emuReadonly: (payload["emu_readonly"] as boolean) ?? false,
    jti: payload["jti"] as string | undefined,
    iat: payload.iat as number | undefined,
    exp: payload.exp as number | undefined,
  };
}

/**
 * Validate the session row a JWT's `sid` claim points at. Tokens issued
 * before migration 0060 lack `sid` — those are accepted unconditionally
 * until they expire naturally (≤ 7 days, the JWT TTL). After the
 * grace window every session decision goes through `sessions`.
 *
 * Emulation tokens (emu=true) skip this check — their lifecycle is
 * managed separately by the SuperAdmin impersonation system.
 */
/** Attach the verified claims AND the flat `userId` the routes read. */
function attachUser(c: Context<AppEnv>, user: JwtPayload): void {
  c.set("user", user);
  c.set("userId", user.sub);
}

async function validateSidClaim(payload: JwtPayload): Promise<boolean> {
  if (payload.emu) return true;
  if (!payload.sid) return true; // Legacy token; accept until natural expiry.
  const db = getDb();
  const session = await loadSessionForJwt(db, payload.sid);
  return !!session && session.userId === payload.sub;
}

/**
 * Optional auth — sets c.var.user if a valid Bearer token is present, otherwise
 * passes through without error. Use on endpoints that are public but benefit
 * from knowing who the caller is (e.g. visibility-conditional profile lookups).
 *
 * Also handles X-Emulation-Token: if present and valid, overrides c.var.user
 * with the emulated user's claims.
 */
export const optionalAuthMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const rawSecret = getJwtSecretOptional();
  if (!rawSecret) return next(); // Not configured — skip auth, treat as anonymous

  const secretKey = new TextEncoder().encode(rawSecret);

  // Resolve the primary user from Authorization header
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    try {
      const { payload } = await jwtVerify(token, secretKey, { algorithms: ["HS256"] });
      const parsed = parseJwtPayload(payload);
      // For optional auth we silently drop the user claim if the
      // session row was revoked — caller proceeds anonymously rather
      // than seeing a 401, since the route is meant to be public.
      if (await validateSidClaim(parsed)) {
        attachUser(c, parsed);
      }
    } catch {
      // Invalid/expired token — treat as unauthenticated
    }
  }

  // If an X-Emulation-Token is present and the caller is a verified SuperAdmin,
  // override c.var.user with the emulated user's claims.
  await applyEmulationToken(c, secretKey);

  return next();
};

export const authMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json(error("UNAUTHORIZED", "Missing or malformed Authorization header"), 401);
  }
  const token = authHeader.slice(7);
  const secretKey = new TextEncoder().encode(getJwtSecret());
  try {
    const { payload } = await jwtVerify(token, secretKey, { algorithms: ["HS256"] });
    const parsed = parseJwtPayload(payload);
    if (!(await validateSidClaim(parsed))) {
      return c.json(error("UNAUTHORIZED", "Session has been revoked"), 401);
    }
    attachUser(c, parsed);
  } catch (err) {
    const message =
      err instanceof Error && err.message.includes("expired") ? "Token has expired" : "Invalid token";
    return c.json(error("UNAUTHORIZED", message), 401);
  }

  // Apply emulation token if present — replaces c.var.user with emulated claims
  const emulationResult = await applyEmulationToken(c, secretKey);
  if (emulationResult) return emulationResult;

  return next();
};

/**
 * Reads X-Emulation-Token, verifies it, confirms the calling admin's JWT
 * is a valid SuperAdmin, then overrides c.var.user with the emulated user.
 *
 * Also enforces emu_readonly: if the token is read-only and the request uses
 * a mutating HTTP verb, returns 403.
 *
 * Returns a Response to short-circuit, or undefined to continue.
 */
async function applyEmulationToken(c: any, secretKey: Uint8Array): Promise<Response | undefined> {
  const emuHeader = c.req.header("X-Emulation-Token");
  if (!emuHeader) return undefined;

  // Verify the calling admin's own token is a SuperAdmin
  const callerUser = c.var.user as JwtPayload | undefined;
  if (!isSuperAdmin(callerUser)) {
    return c.json(error("FORBIDDEN", "Only SuperAdmins can use emulation tokens"), 403) as Response;
  }

  try {
    const { payload } = await jwtVerify(emuHeader, secretKey, { algorithms: ["HS256"] });

    // Validate this is actually an emulation token
    if (!payload["emu"]) {
      return c.json(error("BAD_REQUEST", "Invalid emulation token"), 400) as Response;
    }

    const emuUser = parseJwtPayload(payload);

    // Block mutating requests if token is read-only
    if (emuUser.emuReadonly && MUTATING_METHODS.has(c.req.method)) {
      return c.json(error("FORBIDDEN", "Write operations are blocked during impersonation. Exit impersonation to perform this action."), 403) as Response;
    }

    // Override context user with emulated user's claims
    attachUser(c, emuUser);
  } catch (err) {
    const message =
      err instanceof Error && err.message.includes("expired")
        ? "Impersonation session has expired"
        : "Invalid emulation token";
    return c.json(error("UNAUTHORIZED", message), 401) as Response;
  }

  return undefined;
}
