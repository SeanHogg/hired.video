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
import { createSession, bumpSessionVersion, revokeAllSessionsForUser } from "./sessions.js";
import { isAccountLocked } from "./lock.js";
import { validateSignupRequest, captchaSoftCheck } from "./signupGuard.js";
import { recordBotBlock } from "./botBlock.js";
import { recordFailedLogin } from "./bruteForce.js";
import { scoreLoginRisk } from "./risk.js";
import { detectCountry } from "./geo.js";
import { checkEmailRateLimit } from "./emailRateLimit.js";
import { getDefaultProfileSections } from "../../../../shared/profile-sections.js";

const { users, userProfiles, passwordResetTokens, emailVerificationTokens, twoFactorCodes, affiliateProfiles, affiliateReferrals, loginEvents } = schema;

// ---------------------------------------------------------------------------
// recordLoginEvent — fire-and-forget insert into login_events. Awaited so
// the row lands before the response (admin tooling sees it immediately),
// but wrapped in try/catch so a telemetry failure never blocks the auth
// flow itself. kind = 'register' | 'login' | 'oauth_login' | 'magic_link';
// failureReason is short machine-readable code (e.g. 'invalid_password').
// ---------------------------------------------------------------------------

interface LoginEventInput {
  userId: string | null;
  email: string | null;
  kind: "register" | "login" | "oauth_login" | "magic_link";
  provider: string | null;
  success: boolean;
  failureReason?: string | null;
}

async function recordLoginEvent(deps: AuthDeps, ev: LoginEventInput): Promise<void> {
  try {
    await deps.db.insert(loginEvents).values({
      userId: ev.userId,
      email: ev.email,
      kind: ev.kind,
      provider: ev.provider,
      ipAddress: deps.clientIp,
      userAgent: deps.userAgent,
      success: ev.success,
      failureReason: ev.failureReason ?? null,
    } as any);
  } catch (err) {
    console.error("[loginEvent] insert failed:", err);
  }
}

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
  /** User-Agent string from the request, for spam attribution +
   *  login-event telemetry. Null when not provided. */
  userAgent: string | null;
  /** ISO-3166-1 alpha-2 from cf-ipcountry (if available). Used by the
   *  geo-gate, sanctions check, and risk scoring. */
  ipCountry: string | null;
  /** True when the caller presented a valid trusted-device signal.
   *  Phase 3 wires this from a HMAC-signed cookie. Drives adaptive MFA. */
  trustedDevicePresent: boolean;
  /** Optional injection points for the network-dependent signup
   *  gates. Tests pass no-op ports to skip MX + HIBP without faking
   *  DoH / HIBP transports. Production omits these and the composer
   *  uses the real implementations. */
  mxCheck?: import("./signupGuard.js").MxCheckPort;
  breachCheck?: import("./signupGuard.js").BreachCheckPort;
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
  const claims: Record<string, unknown> = {
    email: payload.email,
    roles: payload.roles,
    emailVerified: payload.emailVerified,
    mustChangePassword: payload.mustChangePassword,
  };
  if (payload.sid) claims.sid = payload.sid;
  return new SignJWT(claims)
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

  const { email, password, role, enableAffiliate } = parsed.data;
  const referralCodeInput = (parsed.data as { referralCode?: string }).referralCode?.trim() || null;
  const attribution = {
    utmSource:       (parsed.data as { utmSource?: string }).utmSource       || null,
    utmMedium:       (parsed.data as { utmMedium?: string }).utmMedium       || null,
    utmCampaign:     (parsed.data as { utmCampaign?: string }).utmCampaign   || null,
    utmTerm:         (parsed.data as { utmTerm?: string }).utmTerm           || null,
    utmContent:      (parsed.data as { utmContent?: string }).utmContent     || null,
    landingReferrer: (parsed.data as { landingReferrer?: string }).landingReferrer || null,
  };
  const name = parsed.data.name
    || [parsed.data.firstName, parsed.data.lastName].filter(Boolean).join(" ")
    || email;

  // Per-email rate limit — closes the IP-rotation gap that the
  // existing per-IP limiter leaves open. Same fn used by login,
  // forgot-password, and magic-link.
  if (
    await checkEmailRateLimit(deps.db, email, "register", {
      countryCode: deps.ipCountry,
      ipAddress: deps.clientIp,
    })
  ) {
    return fail(429, "RATE_LIMIT", "Too many signup attempts for this email. Try again later.");
  }

  // Single composer for every signup gate (OFAC → geo → honeypot →
  // disposable → captcha → MX → breach). Each block writes its own
  // bot_block_events row; we just convert the result into an HTTP
  // failure shape.
  const guard = await validateSignupRequest(
    {
      db: deps.db,
      captcha: deps.captcha,
      endpoint: "register",
      mxCheck: deps.mxCheck,
      breachCheck: deps.breachCheck,
    },
    {
      email,
      password,
      honeypot: (parsed.data as { website?: string | null }).website ?? null,
      cfTurnstileToken: parsed.data.cfTurnstileToken ?? null,
      countryCode: deps.ipCountry,
      ipAddress: deps.clientIp,
    },
  );
  if (!guard.ok) {
    await recordLoginEvent(deps, {
      userId: null,
      email,
      kind: "register",
      provider: "password",
      success: false,
      failureReason: guard.reason ?? "signup_blocked",
    });
    const status = guard.reason === "OFAC_BLOCKED"
      ? 403
      : guard.reason === "GEO_BLOCKED"
      ? 403
      : 400;
    return fail(status, guard.reason ?? "SIGNUP_BLOCKED", guard.message ?? "Signup blocked");
  }
  // Soft signals fired during validation (today: TURNSTILE_FAIL on
  // missing/invalid token — #1122). The signup still proceeds, but we
  // log the signal on the register event so postmortems can correlate
  // the bot_block_events row to a specific account creation. Email
  // verification is required (line below) — bots without inbox access
  // never activate the account.
  if (guard.softSignals && guard.softSignals.length > 0) {
    await recordLoginEvent(deps, {
      userId: null,
      email,
      kind: "register",
      provider: "password",
      success: true,
      failureReason: `soft:${guard.softSignals.join(",")}`,
    });
  }

  const existing = await deps.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing.length > 0) {
    await recordLoginEvent(deps, {
      userId: existing[0]?.id ?? null,
      email,
      kind: "register",
      provider: "password",
      success: false,
      failureReason: "email_exists",
    });
    return fail(409, "CONFLICT", "An account with this email already exists");
  }

  const passwordHash = await hashPassword(password);
  const [user] = await deps.db
    .insert(users)
    .values({
      email,
      name,
      passwordHash,
      role,
      // Pin the signup network attribution to the user row so spam
      // investigation works without scanning request_logs.
      signupIp: deps.clientIp,
      signupUserAgent: deps.userAgent,
      // Inbound campaign attribution snapshot — first-touch values
      // forwarded by the signup form (#1195). Nullable: organic signups
      // arrive with `null` across the board, which is the correct read
      // for downstream LTV-by-campaign queries.
      utmSource: attribution.utmSource,
      utmMedium: attribution.utmMedium,
      utmCampaign: attribution.utmCampaign,
      utmTerm: attribution.utmTerm,
      utmContent: attribution.utmContent,
      landingReferrer: attribution.landingReferrer,
    } as any)
    .returning({ id: users.id, email: users.email, name: users.name, role: users.role });

  if (!user) {
    return fail(500, "INTERNAL_SERVER_ERROR", "Failed to create user");
  }

  await recordLoginEvent(deps, {
    userId: user.id,
    email: user.email,
    kind: "register",
    provider: "password",
    success: true,
  });

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
  // Seed a user_profiles row with role-based section visibility defaults
  // so /people/[id] hides resume sections for recruiters/employers from
  // the moment they sign up. Existing accounts (no profile row, or row
  // with `{}`) get the same defaults via the resolver fall-through, so
  // there's no backfill to write. Per-key overrides ship later through
  // PUT /api/users/me { profileSections: ... }.
  try {
    await deps.db
      .insert(userProfiles)
      .values({
        userId: user.id,
        profileSections: getDefaultProfileSections(user.role ?? "job_seeker"),
      } as any)
      .onConflictDoNothing({ target: userProfiles.userId });
  } catch (err) {
    console.error("[register] Failed to seed profile section defaults:", err);
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

  // Inbound referral attribution (#1194). If the visitor arrived via an
  // affiliate's `?ref=CODE` link, the frontend forwards that code here.
  // Resolve it to a real `affiliate_profiles` row and stamp the linkage
  // so the conversion lookup in `recordAffiliateConversion` (payment.ts)
  // can credit the affiliate when this user eventually pays. Self-
  // referrals (a user signing up with their own code, theoretically only
  // possible after enableAffiliate just minted one this same request)
  // are dropped — the affiliate profile lookup runs before the
  // enableAffiliate insert above is visible to a fresh select on a
  // different transaction, so this is best-effort either way and
  // guarding here keeps the policy explicit.
  if (referralCodeInput) {
    try {
      const [aff] = await deps.db
        .select({ id: affiliateProfiles.id, userId: affiliateProfiles.userId, status: affiliateProfiles.status })
        .from(affiliateProfiles)
        .where(eq(affiliateProfiles.referralCode, referralCodeInput))
        .limit(1);
      if (aff && aff.userId !== user.id && aff.status !== "disabled") {
        await deps.db.insert(affiliateReferrals).values({
          affiliateId: aff.id,
          referredUserId: user.id,
          referralCode: referralCodeInput,
          ipAddress: deps.clientIp,
          userAgent: deps.userAgent,
        } as any);
      }
    } catch (err) {
      // Idempotency: a duplicate insert under the partial unique index
      // (migration 0116) is the expected outcome for a retried POST
      // /register. Log + continue — the existing row already attributes
      // the user to the affiliate.
      console.error("[register] Failed to record affiliate referral:", err);
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
    return fail(429, "RATE_LIMIT", "Too many login attempts for this email. Try again later.");
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
    return fail(401, "UNAUTHORIZED", "Invalid email or password");
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
    return fail(401, "UNAUTHORIZED", "Account is disabled");
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
    return fail(403, "FORBIDDEN", "Account is suspended");
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
    return fail(423, "ACCOUNT_LOCKED", "Account is temporarily locked. Try again later or contact support.");
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
    return fail(401, "UNAUTHORIZED", "Invalid email or password");
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

  return ok({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    token,
    refreshToken,
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

  // Invalidate every existing JWT in the wild + every active session
  // row. Bumping session_version covers legacy tokens (no `sid` claim);
  // revokeAllSessionsForUser covers post-0060 tokens whose `sid` claim
  // points at session rows.
  await bumpSessionVersion(deps.db, tokenRow.userId);
  await revokeAllSessionsForUser(deps.db, tokenRow.userId, "password_reset");

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

  // Return the userId so the route adapter can issue a fresh JWT.
  // Without this the caller's stored token still carries
  // `emailVerified: false` and every subsequent request bounces off
  // emailVerifiedMiddleware → 403, even though the DB row now reads
  // verified.
  return ok({ userId: tokenRow.userId });
}
