import { Hono } from "hono";
import { SignJWT } from "jose";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Variables, JwtPayload } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";

const { users } = schema;

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

async function verifyPassword(password: string, stored: string): Promise<boolean> {
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

// ============================================================================
// SCHEMAS
// ============================================================================

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  role: z
    .enum(["job_seeker", "recruiter", "employer", "affiliate", "admin"])
    .default("job_seeker"),
});

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
  const { email, password, name, role } = parsed.data;

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    return c.json(error("CONFLICT", "An account with this email already exists"), 409);
  }

  const passwordHash = await hashPassword(password);
  const [user] = await db
    .insert(users)
    .values({ email, name, passwordHash, role })
    .returning({ id: users.id, email: users.email, name: users.name, role: users.role });

  if (!user) {
    return c.json(error("INTERNAL_SERVER_ERROR", "Failed to create user"), 500);
  }

  const token = await createJwt(
    { sub: user.id, email: user.email, roles: [user.role], emailVerified: false, mustChangePassword: false },
    process.env.JWT_SECRET ?? "",
  );

  return c.json(
    success({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      token,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
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

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return c.json(error("UNAUTHORIZED", "Invalid email or password"), 401);
  }

  const token = await createJwt(
    { sub: user.id, email: user.email, roles: [user.role], emailVerified: false, mustChangePassword: false },
    process.env.JWT_SECRET ?? "",
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
    const secretKey = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secretKey, { algorithms: ["HS256"] });

    const newToken = await createJwt(
      {
        sub: payload.sub as string,
        email: payload["email"] as string,
        
        roles: (payload["roles"] as string[]) ?? [], emailVerified: (payload["emailVerified"] as boolean) ?? false, mustChangePassword: (payload["mustChangePassword"] as boolean) ?? false,
      },
      process.env.JWT_SECRET ?? "",
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

  // Always return success to avoid email enumeration attacks
  return c.json(
    success(null, "If an account exists for that email, a reset link has been sent"),
  );
});

/** POST /api/auth/reset-password */
authRoutes.post("/reset-password", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = ResetPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request body", { issues: parsed.error.flatten() }), 400);
  }

  // TODO: validate reset token from a tokens table and update password hash
  return c.json(error("NOT_IMPLEMENTED", "Password reset tokens not yet implemented"), 501);
});

/** POST /api/auth/verify-email */
authRoutes.post("/verify-email", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = VerifyEmailSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request body"), 400);
  }

  // TODO: validate email verification token and mark user as verified
  return c.json(error("NOT_IMPLEMENTED", "Email verification tokens not yet implemented"), 501);
});

/** GET /api/auth/me — requires valid JWT passed as Authorization header */
authRoutes.get("/me", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json(error("UNAUTHORIZED", "Missing Authorization header"), 401);
  }

  const { jwtVerify } = await import("jose");
  try {
    const token = authHeader.slice(7);
    const secretKey = new TextEncoder().encode(process.env.JWT_SECRET);
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
