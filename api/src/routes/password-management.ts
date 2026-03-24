import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import type { Variables } from "../types/index.js";
import { getDb, schema } from "../db/index.js";

export const passwordManagementRoutes = new Hono<{ Variables: Variables }>();

// Password policy constants — must match frontend and email copy
const PASSWORD_EXPIRY_DAYS = 90;

function ok<T>(data: T) {
  return { success: true as const, data, timestamp: new Date().toISOString() };
}

function evaluatePassword(password: string) {
  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChars = /[^A-Za-z0-9]/.test(password);
  const isNotCommon = !/^(password|123456|qwerty|admin)$/i.test(password.trim());

  const checks = [hasMinLength, hasUppercase, hasLowercase, hasNumbers, hasSpecialChars, isNotCommon];
  const score = Math.round((checks.filter(Boolean).length / checks.length) * 100);
  const isValid = checks.every(Boolean);

  const requirements = [
    "At least 8 characters",
    "At least one uppercase letter",
    "At least one lowercase letter",
    "At least one number",
    "At least one special character",
    "Not a common password",
  ];

  const suggestions: string[] = [];
  if (!hasMinLength) suggestions.push("Use at least 8 characters");
  if (!hasUppercase) suggestions.push("Add an uppercase letter");
  if (!hasLowercase) suggestions.push("Add a lowercase letter");
  if (!hasNumbers) suggestions.push("Add a number");
  if (!hasSpecialChars) suggestions.push("Add a special character");
  if (!isNotCommon) suggestions.push("Avoid common passwords");

  return {
    isValid,
    score,
    requirements,
    suggestions,
    hasMinLength,
    hasUppercase,
    hasLowercase,
    hasNumbers,
    hasSpecialChars,
    isNotCommon,
  };
}

passwordManagementRoutes.get("/requirements", (c) =>
  c.json(
    ok({
      requiresPasswordChange: false,
      isTemporaryPassword: false,
      passwordSetDate: new Date().toISOString(),
      passwordExpiryDate: undefined,
      daysUntilExpiry: 90,
      reason: "",
      canSkip: true,
    }),
    200,
  ),
);

passwordManagementRoutes.post("/validate-strength", async (c) => {
  const body = await c.req.json().catch(() => "");
  const password = typeof body === "string" ? body : String(body?.password ?? "");
  return c.json(ok(evaluatePassword(password)), 200);
});

passwordManagementRoutes.post("/force-change", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const newPassword = String(body?.newPassword ?? "");
  const confirmPassword = String(body?.confirmPassword ?? "");

  if (!newPassword || newPassword !== confirmPassword) {
    return c.json(
      {
        success: false,
        error: { code: "VALIDATION_ERROR", message: "Passwords do not match" },
        timestamp: new Date().toISOString(),
      },
      400,
    );
  }

  const strength = evaluatePassword(newPassword);
  if (!strength.isValid) {
    return c.json(
      {
        success: false,
        error: { code: "WEAK_PASSWORD", message: "Password does not meet requirements", details: strength },
        timestamp: new Date().toISOString(),
      },
      400,
    );
  }

  return c.json(ok({ success: true }), 200);
});

// ---------------------------------------------------------------------------
// POST /api/passwordmanagement/validate-history
// Check whether a candidate password has been used recently.
// Body: { password: string }
// Returns: { isReused: boolean, message: string }
// ---------------------------------------------------------------------------
passwordManagementRoutes.post("/validate-history", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } }, 401);

  const body = await c.req.json().catch(() => ({}));
  const candidate = typeof body.password === "string" ? body.password : "";
  if (!candidate) return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: "password is required" } }, 400);

  const db = getDb();
  // Fetch last 5 password hashes for this user
  const history = await db
    .select({ passwordHash: schema.passwordHistory.passwordHash })
    .from(schema.passwordHistory)
    .where(eq(schema.passwordHistory.userId, userId))
    .orderBy(desc(schema.passwordHistory.createdAt))
    .limit(5);

  // Re-use the PBKDF2 verify logic: check candidate against each stored hash
  let isReused = false;
  for (const entry of history) {
    const [saltHex, hashHex] = entry.passwordHash.split(":");
    if (!saltHex || !hashHex) continue;
    try {
      const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map((b: string) => parseInt(b, 16)));
      const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(candidate), "PBKDF2", false, ["deriveBits"]);
      const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" }, keyMaterial, 256);
      const candidateHex = Array.from(new Uint8Array(bits)).map((b) => b.toString(16).padStart(2, "0")).join("");
      if (candidateHex === hashHex) { isReused = true; break; }
    } catch { continue; }
  }

  return c.json(ok({
    isReused,
    message: isReused
      ? "This password has been used recently. Please choose a different password."
      : "Password has not been used recently.",
  }), 200);
});

// ---------------------------------------------------------------------------
// GET /api/passwordmanagement/is-expired
// Check whether the authenticated user's password has expired.
// Returns: { isExpired: boolean, daysUntilExpiry: number, expiredAt?: string }
// ---------------------------------------------------------------------------
passwordManagementRoutes.get("/is-expired", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } }, 401);

  const db = getDb();
  const [user] = await db
    .select({ passwordChangedAt: schema.users.passwordChangedAt, createdAt: schema.users.createdAt })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  if (!user) return c.json({ success: false, error: { code: "NOT_FOUND", message: "User not found" } }, 404);

  const baseline = user.passwordChangedAt ?? user.createdAt;
  const expiresAt = new Date(baseline.getTime() + PASSWORD_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  const now = new Date();
  const isExpired = now > expiresAt;
  const daysUntilExpiry = Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));

  return c.json(ok({
    isExpired,
    daysUntilExpiry,
    expiredAt: isExpired ? expiresAt.toISOString() : undefined,
    expiresAt: expiresAt.toISOString(),
    passwordChangedAt: baseline.toISOString(),
  }), 200);
});

passwordManagementRoutes.all("*", (c) =>
  c.json(
    {
      success: false,
      error: { code: "NOT_IMPLEMENTED", message: "Password management routes coming soon" },
      timestamp: new Date().toISOString(),
    },
    501,
  ),
);
