import { Hono } from "hono";
import { SignJWT, jwtVerify } from "jose";
import {
  handleRegister,
  handleLogin,
  handleForgotPassword,
  handleResetPassword,
  handleVerifyEmail,
} from "../services/auth/AuthService.js";
import { buildAuthDeps } from "../services/auth/deps.js";
import { createSession } from "../services/auth/sessions.js";
import { captchaSoftCheck } from "../services/auth/signupGuard.js";
import {
  requestEmailChange,
  confirmCurrent as confirmEmailChangeCurrent,
  confirmNew as confirmEmailChangeNew,
} from "../services/auth/emailChange.js";
import { verifyTotp } from "../services/auth/totp.js";
import { consumeBackupCode } from "../services/auth/backupCodes.js";
import { mintTrustedDeviceCookie } from "../services/auth/trustedDevice.js";
import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import type { Variables, JwtPayload } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import {
  sendVerificationEmail,
  sendResendVerificationEmail,
  sendPasswordResetEmail,
  sendTwoFactorEmail,
  sendMagicLinkEmail,
} from "../services/adapters/email.js";
import { seedOnboardingTasks } from "../lib/onboarding.js";
import { triggerOnboardingDrip } from "../lib/onboardingDrip.js";
import { registerRateLimiterMiddleware, authWriteRateLimiterMiddleware } from "../middleware/rateLimiter.js";

const { users, passwordResetTokens, emailVerificationTokens, twoFactorCodes, magicLinkTokens, affiliateProfiles } = schema;

function getJwtSecret(): string {
  return process.env.JWT_SECRET || (globalThis as any).__ENV?.JWT_SECRET || "";
}

// ============================================================================
// HELPERS
// ============================================================================

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  const saltHex = Array.from(salt).map((b) => b.toString(16).padStart(2, "0")).join("");
  const hashHex = Array.from(new Uint8Array(bits))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${saltHex}:${hashHex}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;

  const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  const candidateHex = Array.from(new Uint8Array(bits))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return candidateHex === hashHex;
}

async function createJwt(payload: Omit<JwtPayload, "iat" | "exp">, secret: string): Promise<string> {
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

export function generateVerificationCode(): string {
  const digits = Array.from(crypto.getRandomValues(new Uint8Array(6))).map((b) => (b % 10).toString());
  return digits.join("");
}

async function createTwoFactorEntry(userId: string) {
  const db = getDb();
  // Invalidate existing pending codes for this user
  await db.update(twoFactorCodes).set({ used: true } as any).where(and(eq(twoFactorCodes.userId, userId), eq(twoFactorCodes.used, false)));

  const code = generateVerificationCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  const [entry] = await db
    .insert(twoFactorCodes)
    .values({ userId, code, expiresAt, used: false } as any)
    .returning();

  return entry;
}

/**
 * Stamp `lastLoginAt = now` on the user. Called from every successful login
 * path (password, 2FA, OAuth, magic link) so the admin UserManagement page
 * reflects real login activity. Exported for unit testing.
 */
export async function markUserLogin(
  db: { update: (table: any) => any },
  userId: string,
  now: Date = new Date(),
): Promise<void> {
  await db
    .update(users)
    .set({ lastLoginAt: now } as any)
    .where(eq(users.id, userId));
}

async function consumeTwoFactorEntry(tempAuthToken: string) {
  const db = getDb();
  const now = new Date();
  const [entry] = await db
    .select()
    .from(twoFactorCodes)
    .where(
      and(
        eq(twoFactorCodes.id, tempAuthToken),
        eq(twoFactorCodes.used, false),
        gt(twoFactorCodes.expiresAt, now),
      ),
    )
    .limit(1);
  if (!entry) return null;

  await db.update(twoFactorCodes).set({ used: true } as any).where(eq(twoFactorCodes.id, entry.id));
  return entry;
}

// ============================================================================
// SCHEMAS
// ============================================================================

export const LoginSchema = z.object({
  email: z.string().email().transform((e) => e.toLowerCase()),
  password: z.string().min(6),
  // Cloudflare Turnstile token. Optional at the schema level so tests /
  // dev don't have to set up Turnstile, but `handleLogin` enforces
  // presence + validity when TURNSTILE_SECRET_KEY is set — same posture
  // as register.
  cfTurnstileToken: z.string().optional(),
});

export const RegisterSchema = z.object({
  email: z.string().email().transform((e) => e.toLowerCase()),
  password: z.string().min(8),
  // Accept either a single `name` field or `firstName`+`lastName` from the frontend.
  name: z.string().min(1).optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  // Canonical lower_snake values only — the schema no longer accepts
  // PascalCase. Clients must send the exact enum value shared via
  // shared/user-roles.ts. Affiliate is NOT a role: it's a service an
  // existing-role user can opt into via `enableAffiliate` below.
  role: z.enum(["job_seeker", "recruiter", "employer", "admin"]).default("job_seeker"),
  // When true, auto-creates an affiliate profile for the new user. The
  // user still holds one of the four roles above — affiliate status is
  // layered on top.
  enableAffiliate: z.boolean().optional(),
  // Cloudflare Turnstile token from the signup widget. Optional at the
  // schema level so tests / dev don't have to set up Turnstile, but the
  // handler enforces presence + validity when TURNSTILE_SECRET_KEY is set.
  cfTurnstileToken: z.string().optional(),
  // Honeypot field — hidden in the form, only filled by naive bots.
  // Any value (including empty string) is accepted at the schema layer;
  // the signup composer rejects when length > 0.
  website: z.string().optional(),
}).refine(
  (d) => d.name || (d.firstName || d.lastName),
  { message: "name or firstName/lastName is required", path: ["name"] },
);

export const ForgotPasswordSchema = z.object({
  email: z.string().email(),
  // Cloudflare Turnstile token. Optional at the schema level so tests /
  // dev don't have to set up Turnstile, but the handler treats a miss
  // as a SOFT signal (records bot_block_event, proceeds with the
  // always-200-no-enumeration response) per the visible-widget posture
  // on every unauthenticated entry form.
  cfTurnstileToken: z.string().optional(),
});

export const ResetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
});

export const VerifyEmailSchema = z.object({
  token: z.string().min(1),
});

export const VerifyTwoFactorSchema = z.object({
  tempAuthToken: z.string().min(1),
  verificationCode: z.string().min(1),
  // When true, mint the HMAC-signed trusted-device cookie so future
  // logins from this device skip MFA for 30 days.
  trustDevice: z.boolean().optional(),
});

export const ResendTwoFactorSchema = z.object({
  tempAuthToken: z.string().min(1),
});

// ============================================================================
// ROUTES
// ============================================================================

export const authRoutes = new Hono<{ Variables: Variables }>();

/** POST /api/auth/register — thin Hono adapter. All business logic lives
 *  in `handleRegister` (auth-handlers.ts) which is tested with mocked deps.
 *  The IP-based rate limiter is the *outer* gate: it stops the bot from
 *  even reaching the handler (and therefore the captcha + DB checks) when
 *  it's pounding from one source. The captcha is the inner gate. */
authRoutes.post("/register", registerRateLimiterMiddleware, async (c) => {
  const body = await c.req.json().catch(() => null);
  const result = await handleRegister(buildAuthDeps(c), body);
  return c.json(result.body as any, result.status as any);
});

/** POST /api/auth/login — thin Hono adapter over handleLogin. */
authRoutes.post("/login", authWriteRateLimiterMiddleware, async (c) => {
  const body = await c.req.json().catch(() => null);
  const result = await handleLogin(buildAuthDeps(c), body);
  return c.json(result.body as any, result.status as any);
});

/** POST /api/auth/refresh — re-issue a token from a valid existing one */
authRoutes.post("/refresh", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json(error("UNAUTHORIZED", "Missing Authorization header"), 401);
  }

  const token = authHeader.slice(7);
  try {
    const secretKey = new TextEncoder().encode(getJwtSecret());
    const { payload } = await jwtVerify(token, secretKey, { algorithms: ["HS256"] });

    const newToken = await createJwt(
      {
        sub: payload.sub as string,
        email: payload["email"] as string,
        
        roles: (payload["roles"] as string[]) ?? [], emailVerified: (payload["emailVerified"] as boolean) ?? false, mustChangePassword: (payload["mustChangePassword"] as boolean) ?? false,
      },
      getJwtSecret(),
    );

    return c.json(
      success({
        token: newToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    );
  } catch {
    return c.json(error("UNAUTHORIZED", "Invalid or expired token"), 401);
  }
});

/** POST /api/auth/logout — stateless; client discards token */
authRoutes.post("/logout", (c) => {
  return c.json(success(null, "Logged out successfully"));
});

/** POST /api/auth/forgot-password — thin Hono adapter over handleForgotPassword. */
authRoutes.post("/forgot-password", authWriteRateLimiterMiddleware, async (c) => {
  const body = await c.req.json().catch(() => null);
  const result = await handleForgotPassword(buildAuthDeps(c), body);
  return c.json(result.body as any, result.status as any);
});

/** POST /api/auth/reset-password — thin Hono adapter over handleResetPassword. */
authRoutes.post("/reset-password", authWriteRateLimiterMiddleware, async (c) => {
  const body = await c.req.json().catch(() => null);
  const result = await handleResetPassword(buildAuthDeps(c), body);
  return c.json(result.body as any, result.status as any);
});

/** POST /api/auth/verify-email — thin Hono adapter over handleVerifyEmail.
 *  On success, issues a fresh JWT carrying `emailVerified: true` so the
 *  caller's NEXT request lands without bouncing off emailVerifiedMiddleware.
 *  Without this, the user's stored token still has the pre-verification
 *  claim and the first post-verify request 403s — even though the DB
 *  row is correct. */
authRoutes.post("/verify-email", async (c) => {
  const body = await c.req.json().catch(() => null);
  const result = await handleVerifyEmail(buildAuthDeps(c), body);
  if (result.status !== 200) {
    return c.json(result.body as any, result.status as any);
  }

  const payload = (result.body as { data?: { userId?: string } }).data;
  const userId = payload?.userId;
  if (!userId) return c.json(result.body as any, 200);

  // Re-fetch the user so the new JWT carries the latest role list +
  // mustChangePassword flag. Don't fail the verification if signing
  // breaks — the DB write already succeeded; just return the no-token
  // shape and let the caller fall back to a manual /auth/refresh.
  try {
    const db = getDb();
    const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!u) return c.json(result.body as any, 200);
    const token = await createJwt(
      {
        sub: u.id,
        email: u.email,
        roles: [u.role],
        emailVerified: true,
        mustChangePassword: u.mustChangePassword ?? false,
      },
      getJwtSecret(),
    );
    return c.json(
      success({
        token,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    );
  } catch (e) {
    console.warn("[verify-email] failed to issue fresh JWT", e);
    return c.json(result.body as any, 200);
  }
});

/** POST /api/auth/verify-2fa */
authRoutes.post("/verify-2fa", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = VerifyTwoFactorSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request body", { issues: parsed.error.flatten() }), 400);
  }

  const db = getDb();

  // The tempAuthToken row tells us *which user* the challenge is for;
  // it must exist and be unused/unexpired even when the user opts to
  // verify via TOTP / backup code (we still want to invalidate the
  // email OTP that was sent in parallel).
  const [pending] = await db
    .select()
    .from(twoFactorCodes)
    .where(eq(twoFactorCodes.id, parsed.data.tempAuthToken))
    .limit(1);
  if (!pending || pending.used || new Date(pending.expiresAt) <= new Date()) {
    return c.json(error("INVALID_TOKEN", "Invalid or expired two-factor token"), 400);
  }
  // 5-attempt brute-force cap on the OTP. Burning the row here forces
  // the user back to the login flow rather than letting them keep
  // grinding the 10^6 space inside the 10-minute TTL.
  if ((pending.attempts ?? 0) >= 5) {
    await db.update(twoFactorCodes).set({ used: true } as any).where(eq(twoFactorCodes.id, pending.id));
    return c.json(error("TOO_MANY_ATTEMPTS", "Too many wrong codes. Please log in again."), 429);
  }

  const [user] = await db.select().from(users).where(eq(users.id, pending.userId)).limit(1);
  if (!user) return c.json(error("NOT_FOUND", "User not found"), 404);

  // Try the three accepted second-factor inputs in order:
  //   1. Email OTP code (matches twoFactorCodes.code)
  //   2. TOTP (RFC 6238) — if user has it enabled
  //   3. Backup code (single-use)
  // Whichever matches consumes the email OTP row regardless, so the
  // window can't be reused after the request.
  const presented = parsed.data.verificationCode.trim();
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
    // Increment the attempt counter — single source of truth for the
    // 5-strike rule. Caller's next attempt will hit the cap above.
    await db
      .update(twoFactorCodes)
      .set({ attempts: (pending.attempts ?? 0) + 1 } as any)
      .where(eq(twoFactorCodes.id, pending.id));
    return c.json(error("INVALID_CODE", "Invalid verification code"), 400);
  }

  await db
    .update(twoFactorCodes)
    .set({ used: true } as any)
    .where(eq(twoFactorCodes.id, pending.id));

  // 2FA-completion is the canonical "this is really the user" moment.
  // The 3-device cap and trusted-device flags get applied via
  // createSession. trustDevice=true also marks the session row as
  // trusted AND mints the HMAC-signed cookie that skips MFA on future
  // logins from this browser.
  const ipAddress = c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? null;
  const userAgent = c.req.header("user-agent") ?? null;
  const wantTrust = parsed.data.trustDevice === true;
  const { session, refreshToken } = await createSession({
    db,
    userId: user.id,
    ipAddress,
    userAgent,
    trusted: wantTrust,
  });
  if (wantTrust) {
    const cookie = await mintTrustedDeviceCookie(user.id);
    c.header(
      "Set-Cookie",
      `hv_trusted_device=${encodeURIComponent(cookie)}; Path=/; Max-Age=${30 * 24 * 60 * 60}; HttpOnly; Secure; SameSite=Lax`,
      { append: true },
    );
  }

  const token = await createJwt(
    { sub: user.id, email: user.email, roles: [user.role], emailVerified: !!user.emailVerified, mustChangePassword: false, sid: session.id },
    getJwtSecret(),
  );

  await markUserLogin(db, user.id);

  return c.json(
    success({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      token,
      refreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    }),
    200,
  );
});

/** POST /api/auth/resend-2fa */
authRoutes.post("/resend-2fa", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = ResendTwoFactorSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request body", { issues: parsed.error.flatten() }), 400);
  }

  const db = getDb();
  const [existing] = await db
    .select()
    .from(twoFactorCodes)
    .where(eq(twoFactorCodes.id, parsed.data.tempAuthToken))
    .limit(1);

  if (!existing || existing.used || new Date(existing.expiresAt) <= new Date()) {
    return c.json(error("INVALID_TOKEN", "Invalid or expired two-factor token"), 400);
  }

  // Create a new code and invalidate the old one.
  await db.update(twoFactorCodes).set({ used: true } as any).where(eq(twoFactorCodes.id, existing.id));
  const entry = await createTwoFactorEntry(existing.userId);

  // Look up user email/name to send the new code
  const [userForEmail] = await db
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, existing.userId))
    .limit(1);
  if (userForEmail) {
    c.executionCtx.waitUntil(
      sendTwoFactorEmail(userForEmail.email, userForEmail.name, entry.code).catch((err) =>
        console.error("[resend-2fa] Failed to send 2FA email:", err),
      ),
    );
  }

  const isDev = process.env.NODE_ENV !== "production";
  return c.json(
    success({
      resent: true,
      tempAuthToken: entry.id,
      ...(isDev ? { verificationCode: entry.code } : {}),
    }),
    200,
  );
});

/** GET /api/auth/verification-status */
authRoutes.get("/verification-status", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json(error("UNAUTHORIZED", "Missing Authorization header"), 401);
  }

  try {
    const token = authHeader.slice(7);
    const secretKey = new TextEncoder().encode(getJwtSecret());
    const { payload } = await jwtVerify(token, secretKey, { algorithms: ["HS256"] });

    const db = getDb();
    const [user] = await db
      .select({ email: users.email, emailVerified: users.emailVerified })
      .from(users)
      .where(eq(users.id, payload.sub as string))
      .limit(1);

    if (!user) {
      return c.json(error("NOT_FOUND", "User not found"), 404);
    }

    return c.json(
      success({
        email: user.email,
        emailConfirmed: !!user.emailVerified,
        sentAt: new Date().toISOString(),
        sendCount: 1,
      }),
      200,
    );
  } catch {
    return c.json(error("UNAUTHORIZED", "Invalid or expired token"), 401);
  }
});

/** POST /api/auth/resend-email-verification */
authRoutes.post("/resend-email-verification", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json(error("UNAUTHORIZED", "Missing Authorization header"), 401);
  }

  try {
    const token = authHeader.slice(7);
    const secretKey = new TextEncoder().encode(getJwtSecret());
    const { payload } = await jwtVerify(token, secretKey, { algorithms: ["HS256"] });
    const db = getDb();
    const [user] = await db
      .select({ id: users.id, email: users.email, name: users.name, emailVerified: users.emailVerified })
      .from(users)
      .where(eq(users.id, payload.sub as string))
      .limit(1);
    if (!user) return c.json(error("NOT_FOUND", "User not found"), 404);
    if (user.emailVerified) return c.json(success({ resent: false }, "Email already verified"), 200);

    // Invalidate old tokens and issue a new one
    await db.update(emailVerificationTokens).set({ used: true } as any).where(eq(emailVerificationTokens.userId, user.id));
    const newToken = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    await db.insert(emailVerificationTokens).values({
      userId: user.id,
      token: newToken,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    c.executionCtx.waitUntil(
      sendResendVerificationEmail(user.email, user.name, newToken).catch((err) =>
        console.error("[resend-email-verification] Failed to send email:", err),
      ),
    );
    const isDev = process.env.NODE_ENV !== "production";
    return c.json(success(isDev ? { verificationToken: newToken } : null, "Verification email sent"), 200);
  } catch {
    return c.json(error("UNAUTHORIZED", "Invalid or expired token"), 401);
  }
});

/** GET /api/auth/me — requires valid JWT passed as Authorization header */
// ---------------------------------------------------------------------------
// POST /api/auth/magic-link — send a one-time login link to email
// ---------------------------------------------------------------------------
authRoutes.post("/magic-link", authWriteRateLimiterMiddleware, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.toLowerCase().trim() : "";
  const cfTurnstileToken = typeof body.cfTurnstileToken === "string" ? body.cfTurnstileToken : null;
  const redirect = typeof body.redirect === "string" ? body.redirect : "/dashboard";
  if (!email) return c.json(error("VALIDATION_ERROR", "email is required"), 400);

  // Captcha — visible widget on every unauthenticated entry form. Treated
  // as a SOFT signal here: the always-200-no-enumeration response stays
  // identical, but the SuperAdmin globe lights up on a miss. Bots without
  // inbox access can't consume the link they trigger. authWriteRateLimiter
  // (20/10min/IP) is the abuse cap on top.
  const deps = buildAuthDeps(c);
  await captchaSoftCheck({
    db: deps.db,
    captcha: deps.captcha,
    endpoint: "magic-link",
    token: cfTurnstileToken,
    countryCode: deps.ipCountry,
    ipAddress: deps.clientIp,
    email,
  });

  const db = getDb();
  const [user] = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  // Always return 200 to avoid user enumeration
  if (!user) return c.json(success({ sent: true }), 200);

  // Invalidate any existing unused tokens for this email
  await db
    .update(magicLinkTokens)
    .set({ used: true } as any)
    .where(and(eq(magicLinkTokens.email, email), eq(magicLinkTokens.used, false)));

  // Generate a secure token
  const rawBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(rawBytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

  await db.insert(magicLinkTokens).values({ email, token, expiresAt, redirect, used: false } as any);

  try {
    await sendMagicLinkEmail(user.email, user.name, token);
  } catch {
    // Don't fail if email service is unavailable — token is stored and usable
  }

  return c.json(success({ sent: true }), 200);
});

// ---------------------------------------------------------------------------
// GET /api/auth/magic-link/verify?token= — exchange token for a JWT session
// ---------------------------------------------------------------------------
authRoutes.get("/magic-link/verify", async (c) => {
  const token = c.req.query("token");
  if (!token) return c.json(error("VALIDATION_ERROR", "token is required"), 400);

  const db = getDb();
  const now = new Date();
  const [entry] = await db
    .select()
    .from(magicLinkTokens)
    .where(and(eq(magicLinkTokens.token, token), eq(magicLinkTokens.used, false), gt(magicLinkTokens.expiresAt, now)))
    .limit(1);

  if (!entry) return c.json(error("UNAUTHORIZED", "Invalid or expired magic link"), 401);

  // Mark token as used
  await db.update(magicLinkTokens).set({ used: true } as any).where(eq(magicLinkTokens.id, entry.id));

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, entry.email))
    .limit(1);

  if (!user) return c.json(error("NOT_FOUND", "User not found"), 404);

  // Mark email verified if not already
  if (!user.emailVerified) {
    await db.update(users).set({ emailVerified: true } as any).where(eq(users.id, user.id));
  }
  await db.update(users).set({ lastLoginAt: new Date() } as any).where(eq(users.id, user.id));

  const jwtSecret = getJwtSecret();
  if (!jwtSecret) return c.json(error("SERVER_ERROR", "JWT secret not configured"), 500);

  const ipAddress = c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? null;
  const userAgent = c.req.header("user-agent") ?? null;
  const { session, refreshToken } = await createSession({
    db,
    userId: user.id,
    ipAddress,
    userAgent,
  });

  const jwt = await createJwt(
    { sub: user.id, email: user.email, roles: [user.role], emailVerified: true, mustChangePassword: user.mustChangePassword, sid: session.id },
    jwtSecret,
  );

  return c.json(success({ token: jwt, refreshToken, redirect: entry.redirect, user: { id: user.id, email: user.email, name: user.name, role: user.role } }), 200);
});

// ---------------------------------------------------------------------------
// Email-change verify flow.
// Three endpoints:
//   POST /api/auth/email-change/request      — auth-required; sends BOTH emails
//   GET  /api/auth/email-change/confirm-current?token= — link from old inbox
//   GET  /api/auth/email-change/confirm-new?token=     — link from new inbox
// Email is only mutated when both confirmations land. Hijack-resistant.
// ---------------------------------------------------------------------------

const RequestEmailChangeSchema = z.object({
  newEmail: z.string().email().transform((e) => e.toLowerCase()),
});

authRoutes.post("/email-change/request", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json(error("UNAUTHORIZED", "Missing Authorization header"), 401);
  }
  let userId: string;
  try {
    const token = authHeader.slice(7);
    const secretKey = new TextEncoder().encode(getJwtSecret());
    const { payload } = await jwtVerify(token, secretKey, { algorithms: ["HS256"] });
    userId = payload.sub as string;
  } catch {
    return c.json(error("UNAUTHORIZED", "Invalid or expired token"), 401);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = RequestEmailChangeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request body", { issues: parsed.error.flatten() }), 400);
  }

  const db = getDb();
  const [user] = await db
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) return c.json(error("NOT_FOUND", "User not found"), 404);

  const result = await requestEmailChange({
    db,
    userId,
    currentEmail: user.email,
    currentName: user.name,
    newEmail: parsed.data.newEmail,
  });
  if (result.ok === false) {
    if (result.reason === "same_email") {
      return c.json(error("VALIDATION_ERROR", "New email is the same as current email"), 400);
    }
    // email_in_use — don't leak which emails are in use; return success
    // shape so an attacker can't probe membership through this endpoint.
    return c.json(success({ requested: true }), 200);
  }
  return c.json(success({ requested: true }), 200);
});

authRoutes.get("/email-change/confirm-current", async (c) => {
  const token = c.req.query("token");
  if (!token) return c.json(error("VALIDATION_ERROR", "token is required"), 400);
  const result = await confirmEmailChangeCurrent(getDb(), token);
  if (result.ok === false) {
    return c.json(error("INVALID_TOKEN", `Token ${result.reason}`), 400);
  }
  return c.json(success({ finalized: result.finalized, newEmail: result.newEmail }), 200);
});

authRoutes.get("/email-change/confirm-new", async (c) => {
  const token = c.req.query("token");
  if (!token) return c.json(error("VALIDATION_ERROR", "token is required"), 400);
  const result = await confirmEmailChangeNew(getDb(), token);
  if (result.ok === false) {
    return c.json(error("INVALID_TOKEN", `Token ${result.reason}`), 400);
  }
  return c.json(success({ finalized: result.finalized, newEmail: result.newEmail }), 200);
});

authRoutes.get("/me", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json(error("UNAUTHORIZED", "Missing Authorization header"), 401);
  }

  try {
    const token = authHeader.slice(7);
    const secretKey = new TextEncoder().encode(getJwtSecret());
    const { payload } = await jwtVerify(token, secretKey, { algorithms: ["HS256"] });

    const db = getDb();
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        emailVerified: users.emailVerified,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, payload.sub as string))
      .limit(1);

    if (!user) {
      return c.json(error("NOT_FOUND", "User not found"), 404);
    }

    return c.json(success(user));
  } catch {
    return c.json(error("UNAUTHORIZED", "Invalid or expired token"), 401);
  }
});
