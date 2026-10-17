/**
 * Password-credential endpoints: register, login, forgot/reset password,
 * verify-email. Thin adapters over services/auth/AuthService.ts (tested with
 * mocked deps). The IP rate limiters are the OUTER gate — they stop a bot
 * before the handler's captcha + DB checks.
 */

import { Hono } from "hono";
import {
  handleRegister,
  handleLogin,
  handleForgotPassword,
  handleResetPassword,
  handleVerifyEmail,
} from "../../services/auth/AuthService.js";
import { buildAuthDeps } from "../../services/auth/deps.js";
import { mintPostVerificationJwt } from "../../services/auth/bearerAccount.js";
import { toHandlerResult } from "../../handlers/shared.js";
import type { AppEnv } from "../../types/index.js";
import { success } from "../../types/index.js";
import { registerRateLimiterMiddleware, authWriteRateLimiterMiddleware } from "../../middleware/rateLimiter.js";
import { logger } from "../../lib/logger.js";

export const credentialRoutes = new Hono<AppEnv>();

/** POST /api/auth/register */
credentialRoutes.post("/register", registerRateLimiterMiddleware, async (c) => {
  const body = await c.req.json().catch(() => null);
  const result = await toHandlerResult(handleRegister(buildAuthDeps(c), body), 201);
  return c.json(result.body as any, result.status as any);
});

/** POST /api/auth/login */
credentialRoutes.post("/login", authWriteRateLimiterMiddleware, async (c) => {
  const body = await c.req.json().catch(() => null);
  const result = await toHandlerResult(handleLogin(buildAuthDeps(c), body));
  return c.json(result.body as any, result.status as any);
});

/** POST /api/auth/forgot-password */
credentialRoutes.post("/forgot-password", authWriteRateLimiterMiddleware, async (c) => {
  const body = await c.req.json().catch(() => null);
  const result = await toHandlerResult(handleForgotPassword(buildAuthDeps(c), body));
  return c.json(result.body as any, result.status as any);
});

/** POST /api/auth/reset-password */
credentialRoutes.post("/reset-password", authWriteRateLimiterMiddleware, async (c) => {
  const body = await c.req.json().catch(() => null);
  const result = await toHandlerResult(handleResetPassword(buildAuthDeps(c), body));
  return c.json(result.body as any, result.status as any);
});

/** POST /api/auth/verify-email — on success, issues a fresh JWT carrying
 *  `emailVerified: true` so the caller's NEXT request doesn't bounce off
 *  emailVerifiedMiddleware with the stale pre-verification claim. Signing
 *  failures don't fail the verification (the DB write already landed) —
 *  the no-token shape is returned and the client falls back to /refresh. */
credentialRoutes.post("/verify-email", async (c) => {
  const body = await c.req.json().catch(() => null);
  const result = await toHandlerResult(handleVerifyEmail(buildAuthDeps(c), body));
  if (result.status !== 200) {
    return c.json(result.body as any, result.status as any);
  }

  const payload = (result.body as { data?: { userId?: string } }).data;
  const userId = payload?.userId;
  if (!userId) return c.json(result.body as any, 200);

  try {
    const fresh = await mintPostVerificationJwt(userId);
    if (!fresh) return c.json(result.body as any, 200);
    return c.json(success(fresh));
  } catch (e) {
    logger.warn("[verify-email] failed to issue fresh JWT", e);
    return c.json(result.body as any, 200);
  }
});
