import { Hono } from "hono";
import type { Variables } from "../types/index.js";

export const passwordManagementRoutes = new Hono<{ Variables: Variables }>();

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
