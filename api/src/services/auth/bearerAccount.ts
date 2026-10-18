/**
 * Bearer-token account use cases behind /api/auth (which bypasses the JWT
 * middleware, so each verifies the presented token itself):
 *   • refreshAccessToken       — POST /refresh
 *   • getVerificationStatus    — GET  /verification-status
 *   • getCurrentUser           — GET  /me
 *   • resendEmailVerification  — POST /resend-email-verification
 *   • mintPostVerificationJwt  — fresh JWT after POST /verify-email
 *
 * Plain data out; DomainError on a rule failure. Any other throw (bad JWT,
 * DB failure) is mapped by the route exactly as before.
 */

import { jwtVerify, type JWTPayload } from "jose";
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { UsersRepository } from "../../repositories/usersRepository.js";
import { AuthTokensRepository } from "../../repositories/authTokensRepository.js";
import {
  findUserContactById,
  findUserSummaryById,
  type UserSummaryRow,
} from "../../repositories/authFlowRepository.js";
import { sendResendVerificationEmail } from "../adapters/email/senders/auth.js";
import { issueJwt } from "./jwt.js";
import { getJwtSecret } from "../../utils/jwt.js";
import { randomHex } from "../../utils/crypto.js";
import { isDevEnvironment } from "../../utils/runtime-env.js";
import { logger } from "../../lib/logger.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Defer a fire-and-forget task past the response (executionCtx.waitUntil). */
export type DeferTask = (task: Promise<unknown>) => void;

/** Verify an HS256 bearer JWT with the configured secret. Throws when invalid. */
export async function verifyBearerJwt(token: string): Promise<JWTPayload> {
  const secretKey = new TextEncoder().encode(getJwtSecret());
  const { payload } = await jwtVerify(token, secretKey, { algorithms: ["HS256"] });
  return payload;
}

/** Re-issue a token from a valid existing one. Mutable claims are re-read
 *  from the DB (role / emailVerified / mustChangePassword can change after
 *  minting), and a deactivated or deleted account can't refresh. */
export async function refreshAccessToken(token: string): Promise<{ token: string; expiresAt: string }> {
  const payload = await verifyBearerJwt(token);
  const u = await new UsersRepository(getDb()).findById(payload.sub as string);
  if (!u || !u.isActive) {
    throw new DomainError(401, "UNAUTHORIZED", "Invalid or expired token");
  }

  const newToken = await issueJwt(
    {
      sub: payload.sub as string,
      email: payload["email"] as string,
      roles: [u.role],
      emailVerified: u.emailVerified,
      mustChangePassword: u.mustChangePassword,
      guest: u.isGuest,
    },
    getJwtSecret(),
  );

  return {
    token: newToken,
    expiresAt: new Date(Date.now() + (u.isGuest ? 30 : 7) * DAY_MS).toISOString(),
  };
}

export async function getVerificationStatus(
  token: string,
): Promise<{ email: string; emailConfirmed: boolean; sentAt: string; sendCount: number }> {
  const payload = await verifyBearerJwt(token);
  const user = await new UsersRepository(getDb()).findVerificationStatus(payload.sub as string);
  if (!user) throw new DomainError(404, "NOT_FOUND", "User not found");
  return {
    email: user.email,
    emailConfirmed: !!user.emailVerified,
    sentAt: new Date().toISOString(),
    sendCount: 1,
  };
}

export async function getCurrentUser(token: string): Promise<UserSummaryRow> {
  const payload = await verifyBearerJwt(token);
  const user = await findUserSummaryById(getDb(), payload.sub as string);
  if (!user) throw new DomainError(404, "NOT_FOUND", "User not found");
  return user;
}

/** Retire the user's outstanding verification tokens and email a new one.
 *  `devToken` is the raw token in dev environments only. */
export async function resendEmailVerification(
  token: string,
  defer: DeferTask,
): Promise<{ alreadyVerified: boolean; devToken: string | null }> {
  const payload = await verifyBearerJwt(token);
  const db = getDb();
  const user = await findUserContactById(db, payload.sub as string);
  if (!user) throw new DomainError(404, "NOT_FOUND", "User not found");
  if (user.emailVerified) return { alreadyVerified: true, devToken: null };

  const tokens = new AuthTokensRepository(db);
  await tokens.retireEmailVerificationTokensForUser(user.id);
  const newToken = randomHex(32);
  await tokens.insertEmailVerificationToken({
    userId: user.id,
    token: newToken,
    expiresAt: new Date(Date.now() + DAY_MS),
  });
  defer(
    sendResendVerificationEmail(user.email, user.name, newToken).catch((err) =>
      logger.error("[resend-email-verification] Failed to send email", err),
    ),
  );
  return { alreadyVerified: false, devToken: isDevEnvironment() ? newToken : null };
}

/** A fresh JWT carrying `emailVerified: true` for a just-verified user, or
 *  null when the user no longer exists. */
export async function mintPostVerificationJwt(userId: string): Promise<{ token: string; expiresAt: string } | null> {
  const u = await new UsersRepository(getDb()).findById(userId);
  if (!u) return null;
  const token = await issueJwt(
    {
      sub: u.id,
      email: u.email,
      roles: [u.role],
      emailVerified: true,
      mustChangePassword: u.mustChangePassword ?? false,
    },
    getJwtSecret(),
  );
  return { token, expiresAt: new Date(Date.now() + 7 * DAY_MS).toISOString() };
}
