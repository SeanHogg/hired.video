/**
 * Account-security use cases mounted under /api/auth/oauth:
 *   • legacy magic link (POST /magic-link, GET /magic-link/verify) — the
 *     primary flow lives in magicLink.ts (/api/auth/magic-link); this
 *     variant keeps its own wire contract (isActive gate, 400 INVALID_TOKEN)
 *   • linked sign-in providers (list / unlink) and "add a password"
 *   • the user's device sessions (list / revoke one / revoke others)
 */

import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { logger } from "../../lib/logger.js";
import { mintMagicLinkToken, setPasswordHashStamped, userHasPassword } from "../../repositories/authFlowRepository.js";
import { AuthTokensRepository } from "../../repositories/authTokensRepository.js";
import { UsersRepository } from "../../repositories/usersRepository.js";
import { getJwtSecret } from "../../utils/jwt.js";
import { sendMagicLinkEmail } from "../adapters/email.js";
import { LoginIdentities } from "../provider-connections/login-identities.js";
import { issueJwt } from "./jwt.js";
import { markUserLogin } from "./loginStamp.js";
import { hashPassword } from "./password.js";
import { createSession, getActiveSessions, revokeAllSessionsForUser, revokeOwnSession } from "./session-lifecycle.js";

const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;
const JWT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// ─── Legacy magic link ───────────────────────────────────────────────────────

/** Enumeration-safe: unknown/inactive emails silently send nothing. */
export async function requestLegacyMagicLink(
  email: string,
  redirect: string,
  waitUntil: (p: Promise<unknown>) => void,
): Promise<void> {
  const db = getDb();
  const user = await new UsersRepository(db).findByEmail(email);
  if (!user || !user.isActive) return;

  const token = await mintMagicLinkToken(db, { email, ttlMs: MAGIC_LINK_TTL_MS, redirect });
  waitUntil(
    sendMagicLinkEmail(email, user.name, token).catch((err) =>
      logger.error("[magic-link] Failed to send", err),
    ),
  );
}

export async function verifyLegacyMagicLink(
  token: string,
  client: { ipAddress: string | null; userAgent: string | null },
) {
  const db = getDb();
  const tokens = new AuthTokensRepository(db);
  const tokenRow = await tokens.findValidMagicLink(token);
  if (!tokenRow) throw new DomainError(400, "INVALID_TOKEN", "Magic link is invalid or has expired");

  await tokens.markMagicLinkUsed(tokenRow.id);

  const user = await new UsersRepository(db).findByEmail(tokenRow.email);
  if (!user || !user.isActive || user.isSuspended) {
    throw new DomainError(401, "UNAUTHORIZED", "Account not found or disabled");
  }

  const { session, refreshToken } = await createSession({ db, userId: user.id, ipAddress: client.ipAddress, userAgent: client.userAgent });
  const jwt = await issueJwt(
    { sub: user.id, email: user.email, roles: [user.role], emailVerified: !!user.emailVerified, mustChangePassword: false, sid: session.id },
    getJwtSecret(),
  );
  await markUserLogin(db, user.id);

  return {
    token: jwt,
    refreshToken,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    redirect: tokenRow.redirect || "/dashboard",
    expiresAt: new Date(Date.now() + JWT_TTL_MS).toISOString(),
  };
}

// ─── Linked sign-in providers + password ─────────────────────────────────────

export async function getLinkedAccounts(userId: string) {
  const db = getDb();
  const accounts = await new LoginIdentities(db).listForUser(userId);
  return { accounts, hasPassword: await userHasPassword(db, userId) };
}

/** Refuses to remove the last sign-in method of a password-less account. */
export async function unlinkProvider(userId: string, provider: string): Promise<void> {
  const db = getDb();
  const hasPassword = await userHasPassword(db, userId);
  const loginIdentities = new LoginIdentities(db);
  const linkedCount = await loginIdentities.countForUser(userId);
  if (!hasPassword && linkedCount <= 1) {
    throw new DomainError(403, "FORBIDDEN", "Cannot disconnect your only sign-in method. Add a password first.");
  }
  const deleted = await loginIdentities.unlink(userId, provider);
  if (!deleted) throw new DomainError(404, "NOT_FOUND", `No ${provider} account linked`);
}

/** First password for an OAuth-only account (never overwrites one). */
export async function addPassword(userId: string, password: string): Promise<void> {
  const db = getDb();
  if (await userHasPassword(db, userId)) throw new DomainError(409, "CONFLICT", "Account already has a password");
  await setPasswordHashStamped(db, userId, await hashPassword(password));
}

// ─── Device sessions ─────────────────────────────────────────────────────────

/** Active sessions with device metadata; `current` marks the caller's own row. */
export async function listUserSessions(userId: string, currentSid: string | undefined) {
  const rows = await getActiveSessions(getDb(), userId);
  return rows.map((s) => ({
    id: s.id,
    deviceLabel: s.deviceLabel,
    ipAddress: s.ipAddress,
    ipCountry: s.ipCountry,
    trusted: s.trusted,
    createdAt: s.createdAt,
    lastSeenAt: s.lastSeenAt,
    expiresAt: s.expiresAt,
    current: currentSid ? s.id === currentSid : false,
  }));
}

/** A user can only revoke their own session rows. */
export async function revokeUserSession(userId: string, sessionId: string): Promise<void> {
  const revoked = await revokeOwnSession(getDb(), userId, sessionId, "user_revoke");
  if (!revoked) throw new DomainError(404, "NOT_FOUND", "Session not found");
}

/** "Log out other devices" — keeps the caller's current session. */
export async function revokeOtherSessions(userId: string, currentSid: string | undefined): Promise<void> {
  await revokeAllSessionsForUser(getDb(), userId, "user_revoke_all", currentSid);
}
