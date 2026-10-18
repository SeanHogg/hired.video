// Password reset + email verification — the token-consuming use cases.

import { eq } from "drizzle-orm";
import { schema } from "../../db/index.js";
import { AuthTokensRepository } from "../../repositories/authTokensRepository.js";
import { ForgotPasswordSchema, ResetPasswordSchema, VerifyEmailSchema } from "./schemas.js";
import { hashPassword } from "./password.js";
import { bumpSessionVersion, revokeAllSessionsForUser } from "./session-lifecycle.js";
import { captchaSoftCheck } from "./signupGuard.js";
import { logger } from "../../lib/logger.js";
import { DomainError } from "../../domains/errors.js";
import type { AuthDeps } from "./authPorts.js";

const { users } = schema;

// ═══════════════════════════════════════════════════════════════════════════
// handleForgotPassword — always 200 to avoid email enumeration
// ═══════════════════════════════════════════════════════════════════════════

export async function handleForgotPassword(deps: AuthDeps, body: unknown): Promise<{ resetToken: string } | null> {
  const parsed = ForgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    throw new DomainError(400, "VALIDATION_ERROR", "Invalid request body");
  }

  // Captcha runs as a SOFT signal — the SuperAdmin globe lights up on
  // a miss, but the always-200-no-enumeration response shape stays
  // identical so attackers can't probe captcha state to learn whether
  // an email has an account. Bots without inbox access still can't
  // consume the reset link.
  await captchaSoftCheck({
    db: deps.db,
    captcha: deps.captcha,
    endpoint: "forgot-password",
    token: parsed.data.cfTurnstileToken ?? null,
    countryCode: deps.ipCountry,
    ipAddress: deps.clientIp,
    email: parsed.data.email,
  });

  const [user] = await deps.db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(eq(users.email, parsed.data.email))
    .limit(1);

  // If the user exists, issue a token; if not, we still return the same
  // response shape so attackers can't use this endpoint to discover
  // which emails have accounts.
  if (user) {
    const token = deps.randomHex(32);
    const expiresAt = new Date(deps.now().getTime() + 60 * 60 * 1000);
    const tokens = new AuthTokensRepository(deps.db, deps.now);
    await tokens.invalidatePasswordResetsForUser(user.id);
    await tokens.insertPasswordResetToken({ userId: user.id, token, expiresAt });
    try {
      await deps.email.sendPasswordReset(user.email, user.name, token);
    } catch (err) {
      logger.error("[forgot-password] Failed to send reset email", err);
    }
    return deps.isDev ? { resetToken: token } : null;
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// handleResetPassword — consume token, rotate hash, stamp passwordChangedAt
// ═══════════════════════════════════════════════════════════════════════════

export async function handleResetPassword(deps: AuthDeps, body: unknown): Promise<null> {
  const parsed = ResetPasswordSchema.safeParse(body);
  if (!parsed.success) {
    throw new DomainError(400, "VALIDATION_ERROR", "Invalid request body", { issues: parsed.error.flatten() });
  }

  const now = deps.now();
  const tokens = new AuthTokensRepository(deps.db, deps.now);
  const tokenRow = await tokens.findValidPasswordResetToken(parsed.data.token);

  if (!tokenRow) throw new DomainError(400, "INVALID_TOKEN", "Reset token is invalid or has expired");

  const passwordHash = await hashPassword(parsed.data.password);
  await deps.db
    .update(users)
    .set({ passwordHash, passwordChangedAt: now } as any)
    .where(eq(users.id, tokenRow.userId));
  await tokens.markPasswordResetUsed(tokenRow.id);

  // Invalidate every existing JWT in the wild + every active session
  // row. Bumping session_version covers legacy tokens (no `sid` claim);
  // revokeAllSessionsForUser covers post-0060 tokens whose `sid` claim
  // points at session rows.
  await bumpSessionVersion(deps.db, tokenRow.userId);
  await revokeAllSessionsForUser(deps.db, tokenRow.userId, "password_reset");

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// handleVerifyEmail — consume email verification token, flip user.emailVerified
// ═══════════════════════════════════════════════════════════════════════════

export async function handleVerifyEmail(deps: AuthDeps, body: unknown): Promise<{ userId: string }> {
  const parsed = VerifyEmailSchema.safeParse(body);
  if (!parsed.success) {
    throw new DomainError(400, "VALIDATION_ERROR", "Invalid request body");
  }

  const tokens = new AuthTokensRepository(deps.db, deps.now);
  const tokenRow = await tokens.findValidEmailVerificationToken(parsed.data.token);

  if (!tokenRow) throw new DomainError(400, "INVALID_TOKEN", "Verification token is invalid or has expired");

  await deps.db.update(users).set({ emailVerified: true } as any).where(eq(users.id, tokenRow.userId));
  await tokens.markEmailVerificationUsed(tokenRow.id);

  // Return the userId so the route adapter can issue a fresh JWT.
  // Without this the caller's stored token still carries
  // `emailVerified: false` and every subsequent request bounces off
  // emailVerifiedMiddleware → 403, even though the DB row now reads
  // verified.
  return { userId: tokenRow.userId };
}
