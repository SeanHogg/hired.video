/**
 * Pure auth handlers — extracted from routes/auth.ts so the Hono layer is
 * only responsible for request/response plumbing, and every business rule
 * can be exercised with mocked dependencies.
 *
 * ─── Why split like this ────────────────────────────────────────────────
 * The original authRoutes.post("/register", async (c) => { ... })
 * handlers called `getDb()` and `sendVerificationEmail()` directly. That
 * pattern hard-codes infrastructure into the business logic and makes
 * SOLID tests impossible:
 *
 *   • Dependency Inversion — handlers should depend on abstractions (a
 *     db port, an email port) not concrete modules.
 *   • Single Responsibility — the handler's job is "given a request,
 *     produce a response"; starting a neon client or talking to
 *     SendPulse is a different concern.
 *   • Open/Closed — swapping the email provider shouldn't require
 *     touching the register handler.
 *
 * So: each public handler takes an `AuthDeps` bag and returns a
 * `HandlerResult`. The Hono route passes the real deps; tests pass
 * fakes and assert both the response and the side effects recorded on
 * the fake deps.
 *
 * The schemas, hashPassword, verifyPassword, and generateVerificationCode
 * still come from routes/auth.ts — they're pure and already tested in
 * auth-schemas.test.ts.
 */

import { SignJWT } from "jose";
import { and, eq, gt } from "drizzle-orm";
import type { JwtPayload } from "../../types/index.js";
import { schema } from "../../db/index.js";
import {
  RegisterSchema,
  LoginSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
  VerifyEmailSchema,
  hashPassword,
  verifyPassword,
  markUserLogin,
} from "../../routes/auth.js";

const { users, passwordResetTokens, emailVerificationTokens, twoFactorCodes, affiliateProfiles } = schema;

// ---------------------------------------------------------------------------
// Ports — the abstractions handlers depend on. Each is a minimal surface
// (Interface Segregation) so tests don't have to mock more than they use.
// ---------------------------------------------------------------------------

export interface EmailerPort {
  sendVerification(to: string, name: string, token: string): Promise<void>;
  sendResendVerification(to: string, name: string, token: string): Promise<void>;
  sendPasswordReset(to: string, name: string, token: string): Promise<void>;
  sendTwoFactor(to: string, name: string, code: string): Promise<void>;
  sendMagicLink(to: string, name: string, token: string): Promise<void>;
}

/** The db port is Drizzle's inferred shape. We widen to `any` at the
 *  edge because the query chain types aren't round-trip stable across
 *  Drizzle minor versions — the tests assert on the stub's recorded
 *  calls, not on the chain types. */
export type DbPort = any;

export interface OnboardingPort {
  seedTasks(userId: string, role: string): Promise<void>;
  triggerDrip(userId: string, email: string, name: string, role: string): Promise<void>;
}

/** Captcha verification port. Concrete impl is Cloudflare Turnstile in
 *  production; tests pass a stub. The no-op variant (used when no secret
 *  is configured) reports `enforced=false` so the handler skips the
 *  check entirely — keeps local dev frictionless. */
export interface CaptchaPort {
  /** True iff a token must be supplied + verified for this environment. */
  enforced: boolean;
  /** Verify a token. Implementations should treat null/empty as failure
   *  unless `enforced` is false (handler short-circuits before calling). */
  verify(token: string | null, clientIp: string | null): Promise<boolean>;
}

export interface AuthDeps {
  db: DbPort;
  email: EmailerPort;
  onboarding: OnboardingPort;
  captcha: CaptchaPort;
  jwtSecret: string;
  /** Injected so tests can freeze time (token expiry checks). */
  now: () => Date;
  /** Injected so tests can produce predictable tokens. Returns a hex string. */
  randomHex: (bytes: number) => string;
  /** If true (dev), include the plaintext verification/reset token in
   *  the response for easier local testing. */
  isDev: boolean;
  /** Caller IP for abuse / captcha attribution. Null when the request
   *  arrives without recognised proxy headers. */
  clientIp: string | null;
}

// Result envelope lives in the shared handler module. auth-handlers
// never needs `requireAuth` (its endpoints are pre-auth anyway: login,
// register, forgot-password), so only ok/fail are imported.
import { ok, fail, type HandlerResult } from "../../handlers/shared.js";
export { ok, fail };
export type { HandlerResult };

// ---------------------------------------------------------------------------
// JWT issuance — tiny wrapper so tests can assert the payload without
// re-implementing sign/verify.
// ---------------------------------------------------------------------------

export async function issueJwt(payload: Omit<JwtPayload, "iat" | "exp">, secret: string): Promise<string> {
  const secretKey = new TextEncoder().encode(secret);
  return new SignJWT({
    email: payload.email,
    roles: payload.roles,
    emailVerified: payload.emailVerified,
    mustChangePassword: payload.mustChangePassword,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secretKey);
}

// ═══════════════════════════════════════════════════════════════════════════
// handleRegister
// ═══════════════════════════════════════════════════════════════════════════

export async function handleRegister(deps: AuthDeps, body: unknown): Promise<HandlerResult> {
  const parsed = RegisterSchema.safeParse(body);
  if (!parsed.success) {
    return fail(400, "VALIDATION_ERROR", "Invalid request body", { issues: parsed.error.flatten() });
  }

  // Captcha gate — only enforced when the deployment has a configured
  // provider (TURNSTILE_SECRET_KEY in prod). Runs *before* DB writes so
  // bots can't burn user-row slots / trigger onboarding emails just by
  // POSTing rapid signups.
  if (deps.captcha.enforced) {
    const token = parsed.data.cfTurnstileToken ?? null;
    const ok = await deps.captcha.verify(token, deps.clientIp);
    if (!ok) {
      return fail(400, "CAPTCHA_FAILED", "Captcha verification failed. Please retry.");
    }
  }

  const { email, password, role, enableAffiliate } = parsed.data;
  const name = parsed.data.name
    || [parsed.data.firstName, parsed.data.lastName].filter(Boolean).join(" ")
    || email;

  const existing = await deps.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing.length > 0) {
    return fail(409, "CONFLICT", "An account with this email already exists");
  }

  const passwordHash = await hashPassword(password);
  const [user] = await deps.db
    .insert(users)
    .values({ email, name, passwordHash, role } as any)
    .returning({ id: users.id, email: users.email, name: users.name, role: users.role });

  if (!user) {
    return fail(500, "INTERNAL_SERVER_ERROR", "Failed to create user");
  }

  const verificationToken = deps.randomHex(32);
  const expiresAt = new Date(deps.now().getTime() + 24 * 60 * 60 * 1000);
  await deps.db.insert(emailVerificationTokens).values({
    userId: user.id,
    token: verificationToken,
    expiresAt,
  });

  // Side effects — errors are logged but never fail the request. The
  // caller (Hono route) wraps these in c.executionCtx.waitUntil(). Tests
  // assert they were called with the expected args.
  try {
    await deps.email.sendVerification(user.email, user.name, verificationToken);
  } catch (err) {
    console.error("[register] Failed to send verification email:", err);
  }
  try {
    await deps.onboarding.seedTasks(user.id, user.role ?? "job_seeker");
  } catch (err) {
    console.error("[register] Failed to seed onboarding tasks:", err);
  }
  try {
    await deps.onboarding.triggerDrip(user.id, user.email, user.name, user.role ?? "job_seeker");
  } catch (err) {
    console.error("[register] Failed to trigger onboarding drip:", err);
  }

  if (enableAffiliate) {
    try {
      const base = name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6).padEnd(4, "X");
      const rand = deps.randomHex(2).toUpperCase(); // deterministic in tests
      const referralCode = `${base}${rand}`;
      await deps.db.insert(affiliateProfiles).values({
        userId: user.id,
        referralCode,
        commissionRate: "0.10",
        status: "active",
      } as any);
    } catch (err) {
      console.error("[register] Failed to create affiliate profile:", err);
    }
  }

  return ok(
    {
      requiresEmailVerification: true,
      email: user.email,
      sentAt: deps.now().toISOString(),
      ...(deps.isDev ? { verificationToken } : {}),
    },
    201,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// handleLogin
// ═══════════════════════════════════════════════════════════════════════════

export async function handleLogin(deps: AuthDeps, body: unknown): Promise<HandlerResult> {
  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return fail(400, "VALIDATION_ERROR", "Invalid request body", { issues: parsed.error.flatten() });
  }

  const [user] = await deps.db
    .select()
    .from(users)
    .where(eq(users.email, parsed.data.email))
    .limit(1);
  if (!user) return fail(401, "UNAUTHORIZED", "Invalid email or password");
  if (!user.isActive) return fail(401, "UNAUTHORIZED", "Account is disabled");
  if (user.isSuspended) return fail(403, "FORBIDDEN", "Account is suspended");

  const valid = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!valid) return fail(401, "UNAUTHORIZED", "Invalid email or password");

  // MFA path — issue a pending 2FA challenge instead of a JWT.
  if (user.mfaEnabled) {
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

    try {
      await deps.email.sendTwoFactor(user.email, user.name, entry.code);
    } catch (err) {
      console.error("[login] Failed to send 2FA email:", err);
    }

    return ok({
      requiresTwoFactor: true,
      tempAuthToken: entry.id,
      expiresAt: entry.expiresAt.toISOString(),
      email: user.email,
      ...(deps.isDev ? { verificationCode: entry.code } : {}),
    });
  }

  const token = await issueJwt(
    {
      sub: user.id,
      email: user.email,
      roles: [user.role],
      emailVerified: !!user.emailVerified,
      mustChangePassword: false,
    },
    deps.jwtSecret,
  );

  await markUserLogin(deps.db, user.id, deps.now());

  return ok({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    token,
    expiresAt: new Date(deps.now().getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// handleForgotPassword — always 200 to avoid email enumeration
// ═══════════════════════════════════════════════════════════════════════════

export async function handleForgotPassword(deps: AuthDeps, body: unknown): Promise<HandlerResult> {
  const parsed = ForgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return fail(400, "VALIDATION_ERROR", "Invalid request body");
  }

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
    await deps.db
      .update(passwordResetTokens)
      .set({ used: true } as any)
      .where(eq(passwordResetTokens.userId, user.id));
    await deps.db
      .insert(passwordResetTokens)
      .values({ userId: user.id, token, expiresAt });
    try {
      await deps.email.sendPasswordReset(user.email, user.name, token);
    } catch (err) {
      console.error("[forgot-password] Failed to send reset email:", err);
    }
    return ok(deps.isDev ? { resetToken: token } : null);
  }

  return ok(null);
}

// ═══════════════════════════════════════════════════════════════════════════
// handleResetPassword — consume token, rotate hash, stamp passwordChangedAt
// ═══════════════════════════════════════════════════════════════════════════

export async function handleResetPassword(deps: AuthDeps, body: unknown): Promise<HandlerResult> {
  const parsed = ResetPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return fail(400, "VALIDATION_ERROR", "Invalid request body", { issues: parsed.error.flatten() });
  }

  const now = deps.now();
  const [tokenRow] = await deps.db
    .select()
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.token, parsed.data.token),
        eq(passwordResetTokens.used, false),
        gt(passwordResetTokens.expiresAt, now),
      ),
    )
    .limit(1);

  if (!tokenRow) return fail(400, "INVALID_TOKEN", "Reset token is invalid or has expired");

  const passwordHash = await hashPassword(parsed.data.password);
  await deps.db
    .update(users)
    .set({ passwordHash, passwordChangedAt: now } as any)
    .where(eq(users.id, tokenRow.userId));
  await deps.db
    .update(passwordResetTokens)
    .set({ used: true } as any)
    .where(eq(passwordResetTokens.id, tokenRow.id));

  return ok(null);
}

// ═══════════════════════════════════════════════════════════════════════════
// handleVerifyEmail — consume email verification token, flip user.emailVerified
// ═══════════════════════════════════════════════════════════════════════════

export async function handleVerifyEmail(deps: AuthDeps, body: unknown): Promise<HandlerResult> {
  const parsed = VerifyEmailSchema.safeParse(body);
  if (!parsed.success) {
    return fail(400, "VALIDATION_ERROR", "Invalid request body");
  }

  const now = deps.now();
  const [tokenRow] = await deps.db
    .select()
    .from(emailVerificationTokens)
    .where(
      and(
        eq(emailVerificationTokens.token, parsed.data.token),
        eq(emailVerificationTokens.used, false),
        gt(emailVerificationTokens.expiresAt, now),
      ),
    )
    .limit(1);

  if (!tokenRow) return fail(400, "INVALID_TOKEN", "Verification token is invalid or has expired");

  await deps.db.update(users).set({ emailVerified: true } as any).where(eq(users.id, tokenRow.userId));
  await deps.db
    .update(emailVerificationTokens)
    .set({ used: true } as any)
    .where(eq(emailVerificationTokens.id, tokenRow.id));

  return ok(null);
}
