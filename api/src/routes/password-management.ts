import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import {
  evaluatePassword,
  getPasswordExpiry,
  isPasswordRecentlyUsed,
} from "../services/auth/passwordPolicy.js";
import { requireUser } from "./helpers/routerHelpers.js";

export const passwordManagementRoutes = new Hono<AppEnv>();

passwordManagementRoutes.get("/requirements", (c) =>
  c.json(
    success({
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
  return c.json(success(evaluatePassword(password)), 200);
});

passwordManagementRoutes.post("/force-change", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const newPassword = String(body?.newPassword ?? "");
  const confirmPassword = String(body?.confirmPassword ?? "");

  if (!newPassword || newPassword !== confirmPassword) {
    return c.json(
      error("VALIDATION_ERROR", "Passwords do not match"),
      400,
    );
  }

  const strength = evaluatePassword(newPassword);
  if (!strength.isValid) {
    return c.json(
      error("WEAK_PASSWORD", "Password does not meet requirements", strength),
      400,
    );
  }

  return c.json(success({ success: true }), 200);
});

// ---------------------------------------------------------------------------
// POST /api/passwordmanagement/validate-history
// Check whether a candidate password has been used recently.
// Body: { password: string }
// Returns: { isReused: boolean, message: string }
// ---------------------------------------------------------------------------
passwordManagementRoutes.post("/validate-history", async (c) => {
  const userId = requireUser(c);

  const body = await c.req.json().catch(() => ({}));
  const candidate = typeof body.password === "string" ? body.password : "";
  if (!candidate) return c.json(error("VALIDATION_ERROR", "password is required"), 400);

  const isReused = await isPasswordRecentlyUsed(userId, candidate);

  return c.json(success({
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
  const userId = requireUser(c);

  return c.json(success(await getPasswordExpiry(userId)), 200);
});
