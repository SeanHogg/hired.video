// handleLogin — password login use case (rate limit, captcha soft check,
// lockout, brute-force counter, adaptive MFA challenge, session + JWT).

import { and, eq } from "drizzle-orm";
import { schema } from "../../db/index.js";
import { LoginSchema } from "./schemas.js";
import { verifyPassword } from "./password.js";
import { markUserLogin } from "./loginStamp.js";
import { createSession } from "./sessions.js";
import { mintTwoFactorApproveToken } from "./twoFactorApprove.js";
import { isAccountLocked } from "./lock.js";
import { captchaSoftCheck } from "./signupGuard.js";
import { recordFailedLogin } from "./bruteForce.js";
import { scoreLoginRisk } from "./risk.js";
import { checkEmailRateLimit } from "./emailRateLimit.js";
import { logger } from "../../lib/logger.js";
import { DomainError } from "../../domains/errors.js";
import type { AuthDeps } from "./authPorts.js";
import { issueJwt } from "./jwt.js";
import { recordLoginEvent } from "./loginEvents.js";

const { users, twoFactorCodes } = schema;

// ═══════════════════════════════════════════════════════════════════════════
// handleLogin
// ═══════════════════════════════════════════════════════════════════════════

export async function handleLogin(deps: AuthDeps, body: unknown) {
  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    throw new DomainError(400, "VALIDATION_ERROR", "Invalid request body", { issues: parsed.error.flatten() });
  }

  const attemptedEmail = parsed.data.email;
  // Per-email rate limit — same fn as register. Triggers a RATE_LIMIT
  // bot_block_event so the SuperAdmin globe lights up under credential
  // stuffing waves regardless of source IP.
  if (
    await checkEmailRateLimit(deps.db, attemptedEmail, "login", {
      countryCode: deps.ipCountry,
      ipAddress: deps.clientIp,
    })
  ) {
    throw new DomainError(429, "RATE_LIMIT", "Too many login attempts for this email. Try again later.");
  }

  // Captcha gate — credential-stuffing protection. A miss (token absent
  // or Turnstile siteverify rejects) no longer hard-blocks the request:
  // that takes down every login when the frontend isn't built with a
  // VITE_TURNSTILE_SITE_KEY paired to the backend secret. Instead we
  // record the bot signal and force the email-OTP step-up after the
  // password check. A real account holder reads the code from their
  // inbox and proceeds; a bot without mailbox access stalls at the
  // second factor. Skipped entirely when no TURNSTILE_SECRET_KEY is
  // set (`enforced=false`).
  // Shared helper — same record-then-branch dance as signup (#1122),
  // so the bot_block_events shape stays consistent across both endpoints.
  const captchaPassed = await captchaSoftCheck({
    db: deps.db,
    captcha: deps.captcha,
    endpoint: "login",
    token: parsed.data.cfTurnstileToken ?? null,
    countryCode: deps.ipCountry,
    ipAddress: deps.clientIp,
    email: attemptedEmail,
  });
  const captchaFailed = !captchaPassed;

  const [user] = await deps.db
    .select()
    .from(users)
    .where(eq(users.email, attemptedEmail))
    .limit(1);
  if (!user) {
    // Record failed-login on a nonexistent email — credential-stuffing
    // signal. user_id stays NULL on the row.
    await recordLoginEvent(deps, {
      userId: null,
      email: attemptedEmail,
      kind: "login",
      provider: "password",
      success: false,
      failureReason: "unknown_email",
    });
    throw new DomainError(401, "UNAUTHORIZED", "Invalid email or password");
  }
  if (!user.isActive) {
    await recordLoginEvent(deps, {
      userId: user.id,
      email: user.email,
      kind: "login",
      provider: "password",
      success: false,
      failureReason: "account_disabled",
    });
    throw new DomainError(401, "UNAUTHORIZED", "Account is disabled");
  }
  if (user.isSuspended) {
    await recordLoginEvent(deps, {
      userId: user.id,
      email: user.email,
      kind: "login",
      provider: "password",
      success: false,
      failureReason: "account_suspended",
    });
    throw new DomainError(403, "FORBIDDEN", "Account is suspended");
  }
  // Lockout gate runs BEFORE the credential compare so a locked account
  // can't be probed for password validity, and so brute-force attempts
  // against a locked user don't accidentally extend the lockout window.
  const lock = await isAccountLocked(deps.db, user.id);
  if (lock) {
    await recordLoginEvent(deps, {
      userId: user.id,
      email: user.email,
      kind: "login",
      provider: "password",
      success: false,
      failureReason: `locked:${lock.reason}`,
    });
    throw new DomainError(423, "ACCOUNT_LOCKED", "Account is temporarily locked. Try again later or contact support.");
  }

  const valid = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!valid) {
    await recordLoginEvent(deps, {
      userId: user.id,
      email: user.email,
      kind: "login",
      provider: "password",
      success: false,
      failureReason: "invalid_password",
    });
    // Brute-force counter — checks recent failures and auto-locks if
    // the threshold is crossed. Same lockAccount fn the SuperAdmin
    // manual-lock path uses (no duplicate code paths).
    await recordFailedLogin({
      db: deps.db,
      userId: user.id,
      email: user.email,
      ipAddress: deps.clientIp,
      countryCode: deps.ipCountry,
    });
    throw new DomainError(401, "UNAUTHORIZED", "Invalid email or password");
  }

  // Credentials accepted — log the event up front so MFA-pending and
  // direct-success paths share one row. (The MFA verify endpoint can
  // log its own follow-up event if/when we want that granularity.)
  await recordLoginEvent(deps, {
    userId: user.id,
    email: user.email,
    kind: "login",
    provider: "password",
    success: true,
  });

  // Adaptive MFA — single source of truth for "should we challenge?".
  // The decision: any user with mfaEnabled OR a non-low risk score is
  // sent to the 2FA path; trusted devices on low-risk logins skip it.
  const risk = await scoreLoginRisk({
    db: deps.db,
    userId: user.id,
    ipCountry: deps.ipCountry,
    ipAddress: deps.clientIp,
    trustedDevicePresent: deps.trustedDevicePresent,
  });
  // captchaFailed → force the email-OTP path so the user proves
  // mailbox control in lieu of the missing Turnstile signal.
  const requiresMfa = user.mfaEnabled || risk.bucket !== "low" || captchaFailed;

  // MFA path — issue a pending 2FA challenge instead of a JWT.
  if (requiresMfa) {
    // Invalidate any prior pending codes for this user.
    await deps.db
      .update(twoFactorCodes)
      .set({ used: true } as any)
      .where(and(eq(twoFactorCodes.userId, user.id), eq(twoFactorCodes.used, false)));

    const code = Array.from({ length: 6 })
      .map(() => String(Math.floor(Math.random() * 10)))
      .join("");
    const expiresAt = new Date(deps.now().getTime() + 10 * 60 * 1000);
    const [entry] = await deps.db
      .insert(twoFactorCodes)
      .values({ userId: user.id, code, expiresAt, used: false } as any)
      .returning();

    // One-tap approve link (gap #2225) — a signed, stateless token bound
    // to this challenge row. Best-effort: a signing/secret failure just
    // omits the button and the user falls back to typing the code.
    let approveToken: string | undefined;
    try {
      approveToken = (await mintTwoFactorApproveToken(entry.id)) ?? undefined;
    } catch (err) {
      logger.error("[login] Failed to mint 2FA approve token", err);
    }

    try {
      await deps.email.sendTwoFactor(user.email, user.name, entry.code, approveToken);
    } catch (err) {
      logger.error("[login] Failed to send 2FA email", err);
    }

    return {
      requiresTwoFactor: true,
      tempAuthToken: entry.id,
      expiresAt: entry.expiresAt.toISOString(),
      email: user.email,
      ...(deps.isDev ? { verificationCode: entry.code } : {}),
    };
  }

  const { session, refreshToken } = await createSession({
    db: deps.db,
    userId: user.id,
    ipAddress: deps.clientIp,
    userAgent: deps.userAgent,
  });

  const token = await issueJwt(
    {
      sub: user.id,
      email: user.email,
      roles: [user.role],
      emailVerified: !!user.emailVerified,
      mustChangePassword: false,
      sid: session.id,
    },
    deps.jwtSecret,
  );

  await markUserLogin(deps.db, user.id, deps.now());

  return {
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    token,
    refreshToken,
    expiresAt: new Date(deps.now().getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  };
}
