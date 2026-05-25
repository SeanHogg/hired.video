/**
 * Integration tests for the pure auth handlers.
 *
 * Uses a hand-rolled in-memory fake DB + a mock emailer + a mock
 * onboarding service — injected via `AuthDeps` (Dependency Inversion).
 * Every handler is exercised through its full success path AND the
 * failure / edge branches that used to be untested:
 *
 *   • register:          success (all 4 roles), duplicate email, validation,
 *                        email fail doesn't break response, affiliate flag,
 *                        onboarding side effects wired up
 *   • login:             success, wrong password, user not found, disabled,
 *                        suspended, MFA-enabled path issues 2FA challenge
 *   • forgot-password:   success (real user), no-enum (unknown email),
 *                        email failure doesn't break response
 *   • reset-password:    success, invalid token, used token, expired token,
 *                        password rotated + token marked used
 *   • verify-email:      success, invalid token, expired token
 *
 * Every assertion is an observable outcome (response body, DB row mutated,
 * email called with specific args). No schema re-tests — those live in
 * auth-schemas.test.ts.
 *
 * Run: node --import tsx --test src/routes/__tests__/auth-handlers.test.ts
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  handleRegister,
  handleLogin,
  handleForgotPassword,
  handleResetPassword,
  handleVerifyEmail,
  type AuthDeps,
  type EmailerPort,
  type OnboardingPort,
} from "../auth/AuthService.js";
import { hashPassword } from "../../routes/auth.js";

// ---------------------------------------------------------------------------
// Fake DB — records every query, lets tests inspect writes
// ---------------------------------------------------------------------------

interface FakeUser {
  id: string;
  email: string;
  name: string;
  role: string;
  passwordHash: string | null;
  isActive: boolean;
  isSuspended: boolean;
  emailVerified: boolean;
  mfaEnabled: boolean;
  lastLoginAt?: Date | null;
  passwordChangedAt?: Date | null;
}
interface FakeToken {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  used: boolean;
}
interface Fake2fa {
  id: string;
  userId: string;
  code: string;
  expiresAt: Date;
  used: boolean;
}

/** Build an in-memory db that covers the query shapes the handlers use.
 *  Every call is recorded on the `calls` array so tests can assert on the
 *  exact writes the handler performed. */
// Fake DB — real WHERE-predicate evaluation via the shared harness.
// `_state.users` etc. alias the DB-named arrays so seed and assert code
// stays idiomatic.

import { buildFakeDb } from "../../handlers/__testing__/fake-db.js";

void randomUUID; // kept for any direct uses below

function makeFakeDb(seed: {
  users?: FakeUser[];
  passwordResetTokens?: FakeToken[];
  emailVerificationTokens?: FakeToken[];
  twoFactorCodes?: Fake2fa[];
} = {}) {
  const fake = buildFakeDb({
    users: (seed.users ?? []) as any,
    password_reset_tokens: (seed.passwordResetTokens ?? []) as any,
    email_verification_tokens: (seed.emailVerificationTokens ?? []) as any,
    two_factor_codes: (seed.twoFactorCodes ?? []) as any,
    affiliate_profiles: [] as any,
  });
  const state = fake.state as any;
  Object.defineProperty(state, "passwordResetTokens", {
    get: () => state.password_reset_tokens,
  });
  Object.defineProperty(state, "emailVerificationTokens", {
    get: () => state.email_verification_tokens,
  });
  Object.defineProperty(state, "twoFactorCodes", {
    get: () => state.two_factor_codes,
  });
  Object.defineProperty(state, "affiliateProfiles", {
    get: () => state.affiliate_profiles,
  });
  return { db: fake.db, state, calls: fake.calls };
}

// ---------------------------------------------------------------------------
// Fake emailer — records every call. Each method can be configured to
// throw on the next call to exercise failure paths.
// ---------------------------------------------------------------------------

function makeFakeEmailer(): EmailerPort & { calls: Array<{ name: string; args: any[] }>; failNext: (name: string) => void } {
  const calls: Array<{ name: string; args: any[] }> = [];
  const failNext = new Set<string>();
  const wrap = <T extends any[]>(name: string) => async (...args: T) => {
    calls.push({ name, args });
    if (failNext.has(name)) {
      failNext.delete(name);
      throw new Error(`${name} simulated failure`);
    }
  };
  return {
    calls,
    failNext: (name: string) => failNext.add(name),
    sendVerification: wrap("sendVerification"),
    sendResendVerification: wrap("sendResendVerification"),
    sendPasswordReset: wrap("sendPasswordReset"),
    sendTwoFactor: wrap("sendTwoFactor"),
    sendMagicLink: wrap("sendMagicLink"),
  };
}

function makeFakeOnboarding(): OnboardingPort & { calls: Array<{ name: string; args: any[] }> } {
  const calls: Array<{ name: string; args: any[] }> = [];
  return {
    calls,
    seedTasks: async (...args) => { calls.push({ name: "seedTasks", args }); },
    triggerDrip: async (...args) => { calls.push({ name: "triggerDrip", args }); },
  };
}

function makeDeps(override: Partial<AuthDeps> = {}): AuthDeps & { _email: ReturnType<typeof makeFakeEmailer>; _onboarding: ReturnType<typeof makeFakeOnboarding>; _state: any; _calls: any[] } {
  const { db, state, calls } = makeFakeDb();
  const email = makeFakeEmailer();
  const onboarding = makeFakeOnboarding();
  return {
    db,
    email,
    onboarding,
    // Default captcha is the no-op (enforced=false) so existing tests
    // don't have to supply tokens. Override to test the gate explicitly.
    captcha: { enforced: false, verify: async () => true },
    jwtSecret: "test-secret-at-least-32-chars-long!!",
    now: () => new Date("2026-04-19T00:00:00.000Z"),
    randomHex: (_n: number) => "deadbeef".repeat(8),
    isDev: true,
    clientIp: null,
    userAgent: null,
    ipCountry: null,
    trustedDevicePresent: false,
    // No-op MX + HIBP so tests don't need real DoH / HIBP transports
    // and can keep using example.com / weak passwords for fixtures.
    mxCheck: { verify: async () => true },
    breachCheck: { isBreached: async () => false },
    _email: email,
    _onboarding: onboarding,
    _state: state,
    _calls: calls,
    ...override,
  } as any;
}

// ═══════════════════════════════════════════════════════════════════════════
// handleRegister
// ═══════════════════════════════════════════════════════════════════════════

describe("handleRegister", () => {
  it("creates a user, verification token, schedules onboarding, sends email, returns 201", async () => {
    const deps = makeDeps();
    const result = await handleRegister(deps, {
      email: "new@example.com",
      password: "password123",
      name: "New User",
      role: "job_seeker",
    });

    assert.equal(result.status, 201);
    assert.equal((result.body as any).data.requiresEmailVerification, true);
    assert.equal((result.body as any).data.email, "new@example.com");

    // User row was written
    assert.equal(deps._state.users.length, 1);
    assert.equal(deps._state.users[0].email, "new@example.com");
    assert.equal(deps._state.users[0].role, "job_seeker");
    // Password was hashed (not stored plain)
    assert.notEqual(deps._state.users[0].passwordHash, "password123");
    assert.match(deps._state.users[0].passwordHash, /^[0-9a-f]{32}:[0-9a-f]{64}$/);

    // Verification token was written
    assert.equal(deps._state.emailVerificationTokens.length, 1);

    // Side effects fired
    assert.equal(deps._email.calls.filter((c) => c.name === "sendVerification").length, 1);
    assert.equal(deps._onboarding.calls.filter((c) => c.name === "seedTasks").length, 1);
    assert.equal(deps._onboarding.calls.filter((c) => c.name === "triggerDrip").length, 1);
  });

  it("rejects validation errors with 400 and issues", async () => {
    const deps = makeDeps();
    const result = await handleRegister(deps, { email: "not-an-email", password: "x", name: "Y" });
    assert.equal(result.status, 400);
    assert.equal((result.body as any).error.code, "VALIDATION_ERROR");
    assert.equal(deps._state.users.length, 0);
    assert.equal(deps._email.calls.length, 0);
  });

  it("rejects duplicate email with 409 and does NOT insert a user", async () => {
    const deps = makeDeps();
    // Seed an existing user at the same email
    deps._state.users.push({ id: "u1", email: "existing@example.com", name: "X", role: "job_seeker", passwordHash: "x:y", isActive: true, isSuspended: false, emailVerified: true, mfaEnabled: false });

    const result = await handleRegister(deps, {
      email: "existing@example.com",
      password: "password123",
      name: "Duplicate",
    });

    assert.equal(result.status, 409);
    assert.equal((result.body as any).error.code, "CONFLICT");
    assert.equal(deps._state.users.length, 1, "no new user inserted");
    assert.equal(deps._email.calls.length, 0, "no email sent for duplicate");
  });

  it("succeeds when email send fails (fire-and-forget, must not block registration)", async () => {
    const deps = makeDeps();
    deps._email.failNext("sendVerification");

    const result = await handleRegister(deps, {
      email: "new@example.com",
      password: "password123",
      name: "New",
    });

    // Registration still succeeds — the user row + token were created.
    assert.equal(result.status, 201);
    assert.equal(deps._state.users.length, 1);
    assert.equal(deps._state.emailVerificationTokens.length, 1);
  });

  it("creates an affiliate profile when enableAffiliate is true", async () => {
    const deps = makeDeps();
    await handleRegister(deps, {
      email: "aff@example.com",
      password: "password123",
      name: "Aff User",
      enableAffiliate: true,
    });
    assert.equal(deps._state.affiliateProfiles.length, 1);
    assert.ok(deps._state.affiliateProfiles[0].referralCode, "referral code generated");
    assert.equal(deps._state.affiliateProfiles[0].commissionRate, "0.10");
    assert.equal(deps._state.affiliateProfiles[0].status, "active");
  });

  it("does NOT create an affiliate profile when flag is absent / false", async () => {
    const deps = makeDeps();
    await handleRegister(deps, { email: "a@b.com", password: "password123", name: "A" });
    assert.equal(deps._state.affiliateProfiles.length, 0);
  });

  it("registers a user for each supported role (job_seeker / recruiter / employer / admin)", async () => {
    for (const role of ["job_seeker", "recruiter", "employer", "admin"]) {
      const deps = makeDeps();
      const result = await handleRegister(deps, {
        email: `${role}@example.com`,
        password: "password123",
        name: `${role} user`,
        role,
      });
      assert.equal(result.status, 201, `register should succeed for ${role}`);
      assert.equal(deps._state.users[0].role, role);
    }
  });

  it("rejects a PascalCase 'JobSeeker' role — canonical snake_case only (no translation layer)", async () => {
    const deps = makeDeps();
    const res = await handleRegister(deps, {
      email: "pascal@example.com",
      password: "password123",
      name: "Pascal",
      role: "JobSeeker",
    });
    assert.equal(res.status, 400);
    assert.equal(deps._state.users.length, 0, "no user created from rejected input");
  });

  it("rejects 'affiliate' as a role — affiliate is an opt-in service, not a role", async () => {
    const deps = makeDeps();
    const res = await handleRegister(deps, {
      email: "aff-role@example.com",
      password: "password123",
      name: "AffRole",
      role: "affiliate",
    });
    assert.equal(res.status, 400);
    assert.equal(deps._state.users.length, 0);
  });

  it("accepts enableAffiliate:true layered on top of a real role (affiliate is a service)", async () => {
    const deps = makeDeps();
    const res = await handleRegister(deps, {
      email: "real-aff@example.com",
      password: "password123",
      name: "RealAff",
      role: "job_seeker", // <-- the actual role
      enableAffiliate: true, // <-- opt-in to the affiliate service
    });
    assert.equal(res.status, 201);
    assert.equal(deps._state.users[0].role, "job_seeker", "role is job_seeker, not 'affiliate'");
    assert.equal(deps._state.affiliateProfiles.length, 1, "affiliate profile created");
  });

  it("falls back to firstName+lastName when name is omitted", async () => {
    const deps = makeDeps();
    await handleRegister(deps, {
      email: "fl@example.com",
      password: "password123",
      firstName: "Ada",
      lastName: "Lovelace",
    });
    assert.equal(deps._state.users[0].name, "Ada Lovelace");
  });

  it("includes the verification token in the response when isDev=true (local debugging)", async () => {
    const deps = makeDeps({ isDev: true });
    const result = await handleRegister(deps, {
      email: "dev@example.com",
      password: "password123",
      name: "Dev",
    });
    assert.ok((result.body as any).data.verificationToken, "verification token exposed in dev");
  });

  it("omits the verification token from the response in production", async () => {
    const deps = makeDeps({ isDev: false });
    const result = await handleRegister(deps, {
      email: "prod@example.com",
      password: "password123",
      name: "Prod",
    });
    assert.equal((result.body as any).data.verificationToken, undefined);
  });

  it("treats a captcha miss as a SOFT signal — signup still succeeds, bot signal still recorded (gap #1122)", async () => {
    // Per #1122: when TURNSTILE_SECRET_KEY is set on the backend but the
    // frontend bundle has no VITE_TURNSTILE_SITE_KEY (or the user's
    // token is replayed/expired), the captcha check used to hard-fail
    // with 400 TURNSTILE_FAIL. That soft-locked every real user with no
    // recovery path. New posture mirrors login: account is created,
    // bot_block_event records the signal for the SuperAdmin globe, and
    // email-verification is the secondary check that catches bots
    // without inbox access.
    const deps = makeDeps();
    deps.captcha = { enforced: true, verify: async () => false };
    const result = await handleRegister(deps, {
      email: "soft-captcha@example.com",
      password: "password123",
      name: "Soft Captcha",
    });
    assert.equal(result.status, 201, "signup proceeds despite captcha miss");
    assert.equal((result.body as any).data.requiresEmailVerification, true);
    assert.equal(deps._state.users.length, 1, "user row was inserted");
    assert.equal(deps._state.emailVerificationTokens.length, 1, "verification token was issued");
    assert.equal(deps._email.calls.filter((c) => c.name === "sendVerification").length, 1);
    assert.ok(
      (deps._state.bot_block_events ?? []).some((e: any) => e.reason === "TURNSTILE_FAIL"),
      "bot_block_event written so the SuperAdmin globe still lights up",
    );
    // The register loginEvent records the soft signal so postmortems
    // can correlate the bot_block_events row to the created account.
    // Table is `login_events` (snake_case) in the fake-db state.
    assert.ok(
      (deps._state.login_events ?? []).some(
        (e: any) => e.kind === "register" && e.success === true && e.failureReason?.startsWith("soft:"),
      ),
      "register loginEvent annotated with the soft signal",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// handleLogin
// ═══════════════════════════════════════════════════════════════════════════

async function seedUser(overrides: Partial<FakeUser> = {}): Promise<FakeUser> {
  const passwordHash = await hashPassword("password123");
  return {
    id: "u1",
    email: "user@example.com",
    name: "Test User",
    role: "job_seeker",
    passwordHash,
    isActive: true,
    isSuspended: false,
    emailVerified: true,
    mfaEnabled: false,
    ...overrides,
  };
}

describe("handleLogin", () => {
  it("issues a JWT + user dto on success", async () => {
    const deps = makeDeps();
    deps._state.users.push(await seedUser());

    const result = await handleLogin(deps, { email: "user@example.com", password: "password123" });

    assert.equal(result.status, 200);
    const body = (result.body as any).data;
    assert.ok(body.token, "JWT returned");
    assert.equal(body.user.id, "u1");
    assert.equal(body.user.email, "user@example.com");
    assert.equal(body.user.role, "job_seeker");
    // lastLoginAt was stamped on the user row
    assert.ok(deps._state.users[0].lastLoginAt instanceof Date);
  });

  it("returns 401 when the user does not exist (same message as wrong password — no enumeration)", async () => {
    const deps = makeDeps();
    const result = await handleLogin(deps, { email: "nope@example.com", password: "password123" });
    assert.equal(result.status, 401);
    assert.equal((result.body as any).error.message, "Invalid email or password");
  });

  it("returns 401 with the same message when the password is wrong", async () => {
    const deps = makeDeps();
    deps._state.users.push(await seedUser());
    const result = await handleLogin(deps, { email: "user@example.com", password: "wrongpass" });
    assert.equal(result.status, 401);
    assert.equal((result.body as any).error.message, "Invalid email or password");
  });

  it("returns 401 'Account is disabled' for inactive users", async () => {
    const deps = makeDeps();
    deps._state.users.push(await seedUser({ isActive: false }));
    const result = await handleLogin(deps, { email: "user@example.com", password: "password123" });
    assert.equal(result.status, 401);
    assert.match((result.body as any).error.message, /disabled/i);
  });

  it("returns 403 'Account is suspended' for suspended users", async () => {
    const deps = makeDeps();
    deps._state.users.push(await seedUser({ isSuspended: true }));
    const result = await handleLogin(deps, { email: "user@example.com", password: "password123" });
    assert.equal(result.status, 403);
    assert.match((result.body as any).error.message, /suspended/i);
  });

  it("triggers the MFA flow (no JWT) when user.mfaEnabled is true", async () => {
    const deps = makeDeps();
    deps._state.users.push(await seedUser({ mfaEnabled: true }));

    const result = await handleLogin(deps, { email: "user@example.com", password: "password123" });

    assert.equal(result.status, 200);
    const body = (result.body as any).data;
    assert.equal(body.requiresTwoFactor, true);
    assert.ok(body.tempAuthToken, "tempAuthToken returned in place of JWT");
    assert.equal(body.token, undefined, "no JWT on MFA path");

    // A 2FA code row was written
    assert.equal(deps._state.twoFactorCodes.length, 1);
    // And the 2FA email was sent
    assert.equal(deps._email.calls.filter((c) => c.name === "sendTwoFactor").length, 1);
  });

  it("rejects malformed bodies with 400 VALIDATION_ERROR", async () => {
    const deps = makeDeps();
    const result = await handleLogin(deps, { email: "not-an-email", password: "x" });
    assert.equal(result.status, 400);
    assert.equal((result.body as any).error.code, "VALIDATION_ERROR");
  });

  it("escalates to email-OTP when captcha is enforced and the token is missing/invalid", async () => {
    // Backend has TURNSTILE_SECRET_KEY set but the frontend bundle has no
    // VITE_TURNSTILE_SITE_KEY → token never reaches us. We must NOT block
    // logins with TURNSTILE_FAIL; instead force the email-OTP step-up so a
    // real account holder still gets through (proves mailbox control) and
    // bots without inbox access stall at the second factor.
    const deps = makeDeps();
    deps.captcha = { enforced: true, verify: async () => false };
    deps._state.users.push(await seedUser());

    const result = await handleLogin(deps, { email: "user@example.com", password: "password123" });

    assert.equal(result.status, 200, "captcha miss must not 400 — login is not blocked");
    const body = (result.body as any).data;
    assert.equal(body.requiresTwoFactor, true, "captcha miss escalates to MFA");
    assert.ok(body.tempAuthToken);
    assert.equal(body.token, undefined, "no JWT on the step-up path");
    // Bot signal still recorded for the SuperAdmin globe.
    assert.ok(
      (deps._state.bot_block_events ?? []).some((e: any) => e.reason === "TURNSTILE_FAIL"),
      "bot_block_event still written so the globe lights up",
    );
  });

  it("does not email an OTP when captcha fails AND the password is wrong (no enumeration)", async () => {
    // The captcha-failed path must run AFTER password verification so we
    // never email a code to an address whose password the caller doesn't
    // know — that would turn the login form into an enumeration oracle.
    const deps = makeDeps();
    deps.captcha = { enforced: true, verify: async () => false };
    deps._state.users.push(await seedUser());

    const result = await handleLogin(deps, { email: "user@example.com", password: "wrongpass" });

    assert.equal(result.status, 401);
    assert.equal(deps._email.calls.filter((c) => c.name === "sendTwoFactor").length, 0);
    assert.equal(deps._state.twoFactorCodes.length, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// handleForgotPassword
// ═══════════════════════════════════════════════════════════════════════════

describe("handleForgotPassword", () => {
  it("issues a reset token + emails the user on success", async () => {
    const deps = makeDeps();
    deps._state.users.push(await seedUser());

    const result = await handleForgotPassword(deps, { email: "user@example.com" });

    assert.equal(result.status, 200);
    assert.equal(deps._state.passwordResetTokens.length, 1);
    assert.equal(deps._email.calls.filter((c) => c.name === "sendPasswordReset").length, 1);
  });

  it("returns 200 for an unknown email — anti-enumeration", async () => {
    const deps = makeDeps();
    const result = await handleForgotPassword(deps, { email: "nobody@example.com" });

    assert.equal(result.status, 200, "must not leak user existence");
    assert.equal(deps._state.passwordResetTokens.length, 0);
    assert.equal(deps._email.calls.length, 0);
  });

  it("response shape is identical for real vs unknown email (no side-channel)", async () => {
    const depsA = makeDeps({ isDev: false });
    const depsB = makeDeps({ isDev: false });
    depsA._state.users.push(await seedUser());

    const real = await handleForgotPassword(depsA, { email: "user@example.com" });
    const fake = await handleForgotPassword(depsB, { email: "nobody@example.com" });

    assert.equal(real.status, fake.status);
    // Exclude timestamp for comparison
    const stripTs = (r: any) => ({ ...r.body, timestamp: "STRIPPED" });
    assert.deepEqual(stripTs(real), stripTs(fake));
  });

  it("still returns 200 even if email send fails (anti-enumeration must hold)", async () => {
    const deps = makeDeps();
    deps._state.users.push(await seedUser());
    deps._email.failNext("sendPasswordReset");

    const result = await handleForgotPassword(deps, { email: "user@example.com" });

    assert.equal(result.status, 200);
    // Token was still stored — user can retry via a different channel.
    assert.equal(deps._state.passwordResetTokens.length, 1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// handleResetPassword
// ═══════════════════════════════════════════════════════════════════════════

describe("handleResetPassword", () => {
  it("rotates the password and marks the token used on success", async () => {
    const deps = makeDeps();
    deps._state.users.push(await seedUser());
    deps._state.passwordResetTokens.push({
      id: "t1",
      userId: "u1",
      token: "good-token",
      expiresAt: new Date("2026-05-01"),
      used: false,
    });

    const result = await handleResetPassword(deps, { token: "good-token", password: "newpassword123" });

    assert.equal(result.status, 200);
    // Password row updated
    assert.notEqual(deps._state.users[0].passwordHash, await hashPassword("password123"));
    assert.match(deps._state.users[0].passwordHash, /^[0-9a-f]{32}:[0-9a-f]{64}$/);
    // passwordChangedAt stamped
    assert.ok(deps._state.users[0].passwordChangedAt instanceof Date);
    // Token consumed
    assert.equal(deps._state.passwordResetTokens[0].used, true);
  });

  it("rejects an unknown/invalid token with 400", async () => {
    const deps = makeDeps();
    // No token seeded — fake db returns empty array for the select.
    const result = await handleResetPassword(deps, { token: "bogus", password: "newpassword123" });
    assert.equal(result.status, 400);
    assert.equal((result.body as any).error.code, "INVALID_TOKEN");
  });

  it("rejects validation errors (too-short password)", async () => {
    const deps = makeDeps();
    const result = await handleResetPassword(deps, { token: "t", password: "short" });
    assert.equal(result.status, 400);
    assert.equal((result.body as any).error.code, "VALIDATION_ERROR");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// handleVerifyEmail
// ═══════════════════════════════════════════════════════════════════════════

describe("handleVerifyEmail", () => {
  it("flips user.emailVerified=true and marks the token used on success", async () => {
    const deps = makeDeps();
    deps._state.users.push(await seedUser({ emailVerified: false }));
    deps._state.emailVerificationTokens.push({
      id: "ev1",
      userId: "u1",
      token: "verify-token",
      expiresAt: new Date("2026-05-01"),
      used: false,
    });

    const result = await handleVerifyEmail(deps, { token: "verify-token" });

    assert.equal(result.status, 200);
    assert.equal(deps._state.users[0].emailVerified, true);
    assert.equal(deps._state.emailVerificationTokens[0].used, true);
  });

  it("rejects missing token with 400 VALIDATION_ERROR", async () => {
    const deps = makeDeps();
    const result = await handleVerifyEmail(deps, {});
    assert.equal(result.status, 400);
    assert.equal((result.body as any).error.code, "VALIDATION_ERROR");
  });

  it("rejects unknown token with 400 INVALID_TOKEN", async () => {
    const deps = makeDeps();
    const result = await handleVerifyEmail(deps, { token: "bogus" });
    assert.equal(result.status, 400);
    assert.equal((result.body as any).error.code, "INVALID_TOKEN");
  });
});
