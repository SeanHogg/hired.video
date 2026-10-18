/**
 * Login two-factor challenge use cases (the email-OTP challenge row minted
 * by login, identified by its `tempAuthToken` = the auth_tokens row id):
 *   • verifyTwoFactorChallenge — POST /api/auth/verify-2fa (code / TOTP / backup code)
 *   • approveTwoFactorLink     — GET  /api/auth/verify-2fa-link (one-tap email approve, gap #2225)
 *   • resendTwoFactorChallenge — POST /api/auth/resend-2fa
 *
 * Plain data out; DomainError on a rule failure. HTTP concerns (the
 * trusted-device Set-Cookie header) stay in the route — this returns the
 * signed cookie value for it.
 */

import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { UsersRepository } from "../../repositories/usersRepository.js";
import { AuthTokensRepository } from "../../repositories/authTokensRepository.js";
import { findUserContactById } from "../../repositories/authFlowRepository.js";
import { sendTwoFactorEmail } from "../adapters/email/senders/auth.js";
import { issueJwt } from "./jwt.js";
import { createSession } from "./session-lifecycle.js";
import { verifyTotp } from "./totp.js";
import { consumeBackupCode } from "./backupCodes.js";
import { mintTrustedDeviceCookie } from "./trustedDevice.js";
import { mintTwoFactorApproveToken, verifyTwoFactorApproveToken } from "./twoFactorApprove.js";
import { generateVerificationCode } from "./password.js";
import { markUserLogin } from "./loginStamp.js";
import type { DeferTask } from "./bearerAccount.js";
import { getJwtSecret } from "../../utils/jwt.js";
import { isDevEnvironment } from "../../utils/runtime-env.js";
import { logger } from "../../lib/logger.js";

/** Request origin recorded on the session row. */
export interface ClientContext {
  ipAddress: string | null;
  userAgent: string | null;
}

export interface TwoFactorSessionPayload {
  user: { id: string; email: string; name: string; role: string };
  token: string;
  refreshToken: string;
  expiresAt: string;
}

export interface TwoFactorSessionResult {
  payload: TwoFactorSessionPayload;
  /** Signed hv_trusted_device value — set only when the device was trusted. */
  trustedDeviceCookie: string | null;
}

const CHALLENGE_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;

/**
 * Decide whether a /resend-2fa request may proceed, given the challenge row the
 * supplied tempAuthToken resolved to (or undefined if the id matched nothing).
 *
 * The WHOLE POINT of resend is to recover a login when the prior code is
 * expired or already consumed — so neither `expired` nor `used` may block a
 * resend (gating on them locks the user out exactly when they need a new code).
 * The only true failure is a token id that maps to no challenge at all, since
 * then we have no userId to email a fresh code to.
 *
 * Pinned by unit tests so this gate cannot silently regress back to
 * rejecting expired/used tokens.
 */
export function canResendTwoFactor(
  existing: { userId: string; used?: boolean; expiresAt?: Date | string } | undefined | null,
): boolean {
  return Boolean(existing && existing.userId);
}

function isOpen(row: { used: boolean | null; expiresAt: Date | string }): boolean {
  return !row.used && new Date(row.expiresAt) > new Date();
}

/**
 * Finalize a passed 2FA challenge into a real session. Single source of
 * truth shared by code entry and the one-tap approve link: create the
 * session row (with the 3-device cap), optionally mint the trusted-device
 * cookie, issue the JWT, and stamp lastLoginAt. The caller has already
 * proven the second factor and consumed the challenge row.
 */
async function completeTwoFactorSession(
  db: ReturnType<typeof getDb>,
  user: { id: string; email: string; name: string; role: string; emailVerified?: boolean | null },
  client: ClientContext,
  opts: { trusted: boolean },
): Promise<TwoFactorSessionResult> {
  const { session, refreshToken } = await createSession({
    db,
    userId: user.id,
    ipAddress: client.ipAddress,
    userAgent: client.userAgent,
    trusted: opts.trusted,
  });
  const trustedDeviceCookie = opts.trusted ? await mintTrustedDeviceCookie(user.id) : null;
  const token = await issueJwt(
    { sub: user.id, email: user.email, roles: [user.role], emailVerified: !!user.emailVerified, mustChangePassword: false, sid: session.id },
    getJwtSecret(),
  );
  await markUserLogin(db, user.id);
  return {
    payload: {
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      token,
      refreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    },
    trustedDeviceCookie,
  };
}

export async function verifyTwoFactorChallenge(
  input: { tempAuthToken: string; verificationCode: string; trustDevice?: boolean },
  client: ClientContext,
): Promise<TwoFactorSessionResult> {
  const db = getDb();
  const tokens = new AuthTokensRepository(db);

  // The tempAuthToken row tells us *which user* the challenge is for; it
  // must exist and be unused/unexpired even when the user verifies via
  // TOTP / backup code (the parallel email OTP is still invalidated).
  const pending = await tokens.findTwoFactorChallenge(input.tempAuthToken);
  if (!pending || !isOpen(pending)) {
    throw new DomainError(400, "INVALID_TOKEN", "Invalid or expired two-factor token");
  }
  // 5-attempt brute-force cap. Burning the row forces the user back to the
  // login flow rather than grinding the 10^6 space inside the TTL.
  if ((pending.attempts ?? 0) >= MAX_ATTEMPTS) {
    await tokens.markTwoFactorCodeUsed(pending.id);
    throw new DomainError(429, "TOO_MANY_ATTEMPTS", "Too many wrong codes. Please log in again.");
  }

  const user = await new UsersRepository(db).findById(pending.userId);
  if (!user) throw new DomainError(404, "NOT_FOUND", "User not found");

  // Accepted second factors, in order: email OTP, TOTP (if enabled), backup
  // code (single-use). Whichever matches, the email OTP row is consumed.
  const presented = input.verificationCode.trim();
  let accepted = false;
  if (presented === pending.code) {
    accepted = true;
  } else if (user.mfaEnabled && user.mfaSecret && /^\d{6}$/.test(presented)) {
    accepted = await verifyTotp(user.mfaSecret, presented);
  }
  if (!accepted) {
    accepted = await consumeBackupCode(db, user.id, presented);
  }
  if (!accepted) {
    // Single source of truth for the 5-strike rule above.
    await tokens.setTwoFactorAttempts(pending.id, (pending.attempts ?? 0) + 1);
    throw new DomainError(400, "INVALID_CODE", "Invalid verification code");
  }

  await tokens.markTwoFactorCodeUsed(pending.id);

  // trustDevice=true marks the session row trusted AND mints the HMAC-signed
  // cookie that skips MFA on future logins from this browser.
  return completeTwoFactorSession(db, user, client, { trusted: input.trustDevice === true });
}

/** The signed email-link token recovers + finalizes the pending challenge.
 *  Proves mailbox control exactly like the code; the row's used/expired
 *  flags are the replay guard. No trust checkbox in an email → untrusted. */
export async function approveTwoFactorLink(token: string, client: ClientContext): Promise<TwoFactorSessionPayload> {
  const verified = await verifyTwoFactorApproveToken(token);
  if (!verified.ok || !verified.challengeId) {
    throw new DomainError(401, "UNAUTHORIZED", "Invalid or expired sign-in link");
  }

  const db = getDb();
  const tokens = new AuthTokensRepository(db);
  const pending = await tokens.findTwoFactorChallenge(verified.challengeId);
  if (!pending || !isOpen(pending)) {
    throw new DomainError(401, "UNAUTHORIZED", "Invalid or expired sign-in link");
  }

  const user = await new UsersRepository(db).findById(pending.userId);
  if (!user) throw new DomainError(404, "NOT_FOUND", "User not found");
  if (!user.isActive) throw new DomainError(401, "UNAUTHORIZED", "Account is disabled");

  // Consume the challenge — same single-use guarantee as code entry.
  await tokens.markTwoFactorCodeUsed(pending.id);

  const { payload } = await completeTwoFactorSession(db, user, client, { trusted: false });
  return payload;
}

/** Mint a fresh code for the challenge's user and email it. `verificationCode`
 *  is echoed in dev environments only. */
export async function resendTwoFactorChallenge(
  tempAuthToken: string,
  defer: DeferTask,
): Promise<{ resent: true; tempAuthToken: string; verificationCode?: string }> {
  const db = getDb();
  const tokens = new AuthTokensRepository(db);
  const existing = await tokens.findTwoFactorChallenge(tempAuthToken);

  // Resend must succeed even when the prior code is expired or used — see
  // canResendTwoFactor. Reject only a token id that maps to no challenge.
  if (!canResendTwoFactor(existing)) {
    throw new DomainError(400, "INVALID_TOKEN", "Invalid or expired two-factor token");
  }

  // Re-issuing retires every pending code for this user (incl. `existing`).
  const entry = await tokens.reissueTwoFactorChallenge({
    userId: existing.userId,
    code: generateVerificationCode(),
    expiresAt: new Date(Date.now() + CHALLENGE_TTL_MINUTES * 60 * 1000),
  });

  const userForEmail = await findUserContactById(db, existing.userId);
  if (userForEmail) {
    const approveToken = (await mintTwoFactorApproveToken(entry.id).catch(() => null)) ?? undefined;
    defer(
      sendTwoFactorEmail(userForEmail.email, userForEmail.name, entry.code, CHALLENGE_TTL_MINUTES, approveToken).catch((err) =>
        logger.error("[resend-2fa] Failed to send 2FA email", err),
      ),
    );
  }

  return {
    resent: true,
    tempAuthToken: entry.id,
    ...(isDevEnvironment() ? { verificationCode: entry.code } : {}),
  };
}
