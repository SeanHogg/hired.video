/**
 * Magic-link sign-in use cases:
 *   • requestMagicLink — POST /api/auth/magic-link (enumeration-safe: the
 *     caller always answers `{ sent: true }`)
 *   • verifyMagicLink  — GET  /api/auth/magic-link/verify (token → session)
 */

import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { UsersRepository } from "../../repositories/usersRepository.js";
import {
  findUserContactByEmail,
  findValidMagicLink,
  insertMagicLink,
  markEmailVerified,
  markMagicLinkUsed,
  retireOpenMagicLinks,
} from "../../repositories/authFlowRepository.js";
import { sendMagicLinkEmail } from "../adapters/email.js";
import type { AuthDeps } from "./authPorts.js";
import { issueJwt } from "./jwt.js";
import { createSession } from "./sessions.js";
import { captchaSoftCheck } from "./signupGuard.js";
import { markUserLogin } from "./loginStamp.js";
import type { ClientContext } from "./twoFactorChallenge.js";
import { getJwtSecret } from "../../utils/jwt.js";
import { randomHex } from "../../utils/crypto.js";

const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;

export async function requestMagicLink(
  input: { email: string; cfTurnstileToken: string | null; redirect: string },
  deps: AuthDeps,
): Promise<void> {
  const { email, redirect } = input;

  // Captcha is a SOFT signal here: the always-200-no-enumeration response
  // stays identical, but the SuperAdmin globe lights up on a miss. Bots
  // without inbox access can't consume the link they trigger.
  await captchaSoftCheck({
    db: deps.db,
    captcha: deps.captcha,
    endpoint: "magic-link",
    token: input.cfTurnstileToken,
    countryCode: deps.ipCountry,
    ipAddress: deps.clientIp,
    email,
  });

  const db = getDb();
  const user = await findUserContactByEmail(db, email);
  // Unknown email: same response as a hit (no user enumeration).
  if (!user) return;

  await retireOpenMagicLinks(db, email);
  const token = randomHex(32);
  await insertMagicLink(db, { email, token, expiresAt: new Date(Date.now() + MAGIC_LINK_TTL_MS), redirect });

  try {
    await sendMagicLinkEmail(user.email, user.name, token);
  } catch {
    // Don't fail if email service is unavailable — token is stored and usable
  }
}

export async function verifyMagicLink(
  token: string,
  client: ClientContext,
): Promise<{
  token: string;
  refreshToken: string;
  redirect: string;
  user: { id: string; email: string; name: string; role: string };
}> {
  const db = getDb();
  const entry = await findValidMagicLink(db, token, new Date());
  if (!entry) throw new DomainError(401, "UNAUTHORIZED", "Invalid or expired magic link");

  await markMagicLinkUsed(db, entry.id);

  const user = await new UsersRepository(db).findByEmail(entry.email);
  if (!user) throw new DomainError(404, "NOT_FOUND", "User not found");

  // Following the link proves mailbox control.
  if (!user.emailVerified) {
    await markEmailVerified(db, user.id);
  }
  await markUserLogin(db, user.id);

  const jwtSecret = getJwtSecret();
  if (!jwtSecret) throw new DomainError(500, "SERVER_ERROR", "JWT secret not configured");

  const { session, refreshToken } = await createSession({
    db,
    userId: user.id,
    ipAddress: client.ipAddress,
    userAgent: client.userAgent,
  });

  const jwt = await issueJwt(
    { sub: user.id, email: user.email, roles: [user.role], emailVerified: true, mustChangePassword: user.mustChangePassword, sid: session.id },
    jwtSecret,
  );

  return {
    token: jwt,
    refreshToken,
    redirect: entry.redirect,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  };
}
