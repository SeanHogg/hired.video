import { Hono } from "hono";
import { SignJWT } from "jose";
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
} from "../services/email.js";
import { seedOnboardingTasks } from "../lib/onboarding.js";
import { triggerOnboardingDrip } from "../lib/onboardingDrip.js";

const { users, passwordResetTokens, emailVerificationTokens, twoFactorCodes, magicLinkTokens } = schema;

function getJwtSecret(): string {
  return process.env.JWT_SECRET || (globalThis as any).__ENV?.JWT_SECRET || "";
}

// ============================================================================
// HELPERS
// ============================================================================

async function hashPassword(password: string): Promise<string> {
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

async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
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
  return new SignJWT({ email: payload.email, roles: payload.roles, emailVerified: payload.emailVerified, mustChangePassword: payload.mustChangePassword })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secretKey);
}

function generateVerificationCode(): string {
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

const LoginSchema = z.object({
  email: z.string().email().transform((e) => e.toLowerCase()),
  password: z.string().min(6),
});

const RegisterSchema = z.object({
  email: z.string().email().transform((e) => e.toLowerCase()),
  password: z.string().min(8),
  // Accept either a single `name` field or `firstName`+`lastName` from the frontend
  name: z.string().min(1).optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  role: z
    .string()
    .transform((r) => {
      // Normalise PascalCase role names sent by the frontend (e.g. "JobSeeker" → "job_seeker")
      const map: Record<string, string> = {
        jobseeker: "job_seeker",
        recruiter: "recruiter",
        employer: "employer",
        affiliate: "affiliate",
        admin: "admin",
      };
      return map[r.toLowerCase().replace(/[^a-z]/g, "")] ?? r;
    })
    .pipe(z.enum(["job_seeker", "recruiter", "employer", "affiliate", "admin"]))
    .default("job_seeker"),
}).refine(
  (d) => d.name || (d.firstName || d.lastName),
  { message: "name or firstName/lastName is required", path: ["name"] },
);

const ForgotPasswordSchema = z.object({
  email: z.string().email(),
});

const ResetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
});

const VerifyEmailSchema = z.object({
  token: z.string().min(1),
});

const VerifyTwoFactorSchema = z.object({
  tempAuthToken: z.string().min(1),
  verificationCode: z.string().min(1),
});

const ResendTwoFactorSchema = z.object({
  tempAuthToken: z.string().min(1),
});

// ============================================================================
// ROUTES
// ============================================================================

export const authRoutes = new Hono<{ Variables: Variables }>();

/** POST /api/auth/register */
authRoutes.post("/register", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = RegisterSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request body", { issues: parsed.error.flatten() }), 400);
  }

  const db = getDb();
  const { email, password, role } = parsed.data;
  const name = parsed.data.name || [parsed.data.firstName, parsed.data.lastName].filter(Boolean).join(" ") || email;

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    return c.json(error("CONFLICT", "An account with this email already exists"), 409);
  }

  const passwordHash = await hashPassword(password);
  const [user] = await db
    .insert(users)
    .values({ email, name, passwordHash, role } as any)
    .returning({ id: users.id, email: users.email, name: users.name, role: users.role });

  if (!user) {
    return c.json(error("INTERNAL_SERVER_ERROR", "Failed to create user"), 500);
  }

  // Issue an email verification token and store it
  const verificationToken = Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  await db.insert(emailVerificationTokens).values({
    userId: user.id,
    token: verificationToken,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
  });

  // Seed onboarding tasks for the new user and send verification email in parallel
  c.executionCtx.waitUntil(
    Promise.all([
      sendVerificationEmail(user.email, user.name, verificationToken).catch((err) =>
        console.error("[register] Failed to send verification email:", err),
      ),
      seedOnboardingTasks(user.id, user.role ?? "job_seeker").catch((err) =>
        console.error("[register] Failed to seed onboarding tasks:", err),
      ),
      triggerOnboardingDrip(user.id, user.email, user.name, user.role ?? "job_seeker").catch((err) =>
        console.error("[register] Failed to trigger onboarding drip:", err),
      ),
    ]),
  );

  const isDev = process.env.NODE_ENV !== "production";
  return c.json(
    success({
      requiresEmailVerification: true,
      email: user.email,
      sentAt: new Date().toISOString(),
      ...(isDev ? { verificationToken } : {}),
    }),
    201,
  );
});

/** POST /api/auth/login */
authRoutes.post("/login", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request body", { issues: parsed.error.flatten() }), 400);
  }

  const db = getDb();
  const { email, password } = parsed.data;

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    return c.json(error("UNAUTHORIZED", "Invalid email or password"), 401);
  }

  if (!user.isActive) {
    return c.json(error("UNAUTHORIZED", "Account is disabled"), 401);
  }

  if (user.isSuspended) {
    return c.json(error("FORBIDDEN", "Account is suspended"), 403);
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return c.json(error("UNAUTHORIZED", "Invalid email or password"), 401);
  }

  // If user has MFA enabled, step through the 2FA flow instead of issuing a JWT.
  if (user.mfaEnabled) {
    const entry = await createTwoFactorEntry(user.id);
    c.executionCtx.waitUntil(
      sendTwoFactorEmail(user.email, user.name, entry.code).catch((err) =>
        console.error("[login] Failed to send 2FA email:", err),
      ),
    );
    const isDev = process.env.NODE_ENV !== "production";
    return c.json(
      success({
        requiresTwoFactor: true,
        tempAuthToken: entry.id,
        expiresAt: entry.expiresAt.toISOString(),
        email: user.email,
        ...(isDev ? { verificationCode: entry.code } : {}),
      }),
      200,
    );
  }

  const token = await createJwt(
    { sub: user.id, email: user.email, roles: [user.role], emailVerified: !!user.emailVerified, mustChangePassword: false },
    getJwtSecret(),
  );

  return c.json(
    success({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      token,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    }),
  );
});

/** POST /api/auth/refresh — re-issue a token from a valid existing one */
authRoutes.post("/refresh", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json(error("UNAUTHORIZED", "Missing Authorization header"), 401);
  }

  const { jwtVerify } = await import("jose");
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

/** POST /api/auth/forgot-password */
authRoutes.post("/forgot-password", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = ForgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request body"), 400);
  }

  const db = getDb();
  const [user] = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(eq(users.email, parsed.data.email))
    .limit(1);

  // Always return success to avoid email enumeration
  if (user) {
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await db
      .update(passwordResetTokens)
      .set({ used: true } as any)
      .where(eq(passwordResetTokens.userId, user.id));
    await db.insert(passwordResetTokens).values({ userId: user.id, token, expiresAt });
    c.executionCtx.waitUntil(
      sendPasswordResetEmail(user.email, user.name, token).catch((err) =>
        console.error("[forgot-password] Failed to send reset email:", err),
      ),
    );
    const isDev = process.env.NODE_ENV !== "production";
    return c.json(
      success(
        isDev ? { resetToken: token } : null,
        "If an account exists for that email, a reset link has been sent",
      ),
    );
  }

  return c.json(success(null, "If an account exists for that email, a reset link has been sent"));
});

/** POST /api/auth/reset-password */
authRoutes.post("/reset-password", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = ResetPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request body", { issues: parsed.error.flatten() }), 400);
  }

  const db = getDb();
  const now = new Date();
  const [tokenRow] = await db
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

  if (!tokenRow) {
    return c.json(error("INVALID_TOKEN", "Reset token is invalid or has expired"), 400);
  }

  const passwordHash = await hashPassword(parsed.data.password);
  await db.update(users).set({ passwordHash, passwordChangedAt: now } as any).where(eq(users.id, tokenRow.userId));
  await db.update(passwordResetTokens).set({ used: true } as any).where(eq(passwordResetTokens.id, tokenRow.id));

  return c.json(success(null, "Password has been reset successfully"));
});

/** POST /api/auth/verify-email */
authRoutes.post("/verify-email", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = VerifyEmailSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request body"), 400);
  }

  const db = getDb();
  const now = new Date();
  const [tokenRow] = await db
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

  if (!tokenRow) {
    return c.json(error("INVALID_TOKEN", "Verification token is invalid or has expired"), 400);
  }

  await db.update(users).set({ emailVerified: true } as any).where(eq(users.id, tokenRow.userId));
  await db.update(emailVerificationTokens).set({ used: true } as any).where(eq(emailVerificationTokens.id, tokenRow.id));

  return c.json(success(null, "Email verified successfully"));
});

/** POST /api/auth/verify-2fa */
authRoutes.post("/verify-2fa", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = VerifyTwoFactorSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request body", { issues: parsed.error.flatten() }), 400);
  }

  const entry = await consumeTwoFactorEntry(parsed.data.tempAuthToken);
  if (!entry) {
    return c.json(error("INVALID_TOKEN", "Invalid or expired two-factor token"), 400);
  }

  if (entry.code !== parsed.data.verificationCode) {
    return c.json(error("INVALID_CODE", "Invalid verification code"), 400);
  }

  const db = getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, entry.userId))
    .limit(1);

  if (!user) {
    return c.json(error("NOT_FOUND", "User not found"), 404);
  }

  const token = await createJwt(
    { sub: user.id, email: user.email, roles: [user.role], emailVerified: !!user.emailVerified, mustChangePassword: false },
    getJwtSecret(),
  );

  return c.json(
    success({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      token,
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

  const { jwtVerify } = await import("jose");
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

  const { jwtVerify } = await import("jose");
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
authRoutes.post("/magic-link", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.toLowerCase().trim() : "";
  const redirect = typeof body.redirect === "string" ? body.redirect : "/dashboard";
  if (!email) return c.json(error("VALIDATION_ERROR", "email is required"), 400);

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

  const jwt = await createJwt(
    { sub: user.id, email: user.email, roles: [user.role], emailVerified: true, mustChangePassword: user.mustChangePassword },
    jwtSecret,
  );

  return c.json(success({ token: jwt, redirect: entry.redirect, user: { id: user.id, email: user.email, name: user.name, role: user.role } }), 200);
});

authRoutes.get("/me", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json(error("UNAUTHORIZED", "Missing Authorization header"), 401);
  }

  const { jwtVerify } = await import("jose");
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
