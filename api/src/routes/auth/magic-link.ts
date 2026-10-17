/**
 * Magic-link sign-in: POST /magic-link (send a one-time login link) and
 * GET /magic-link/verify (exchange the token for a session). Rules live in
 * services/auth/magicLink.ts.
 */

import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import { buildAuthDeps } from "../../services/auth/deps.js";
import { requestMagicLink, verifyMagicLink } from "../../services/auth/magicLink.js";
import { authWriteRateLimiterMiddleware } from "../../middleware/rateLimiter.js";
import { runUseCase, clientContext } from "./http.js";

export const magicLinkRoutes = new Hono<AppEnv>();

/** POST /api/auth/magic-link — always 200 `{ sent: true }` (no user
 *  enumeration). Captcha is a soft signal; authWriteRateLimiter
 *  (20/10min/IP) is the abuse cap. */
magicLinkRoutes.post("/magic-link", authWriteRateLimiterMiddleware, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.toLowerCase().trim() : "";
  const cfTurnstileToken = typeof body.cfTurnstileToken === "string" ? body.cfTurnstileToken : null;
  const redirect = typeof body.redirect === "string" ? body.redirect : "/dashboard";
  if (!email) return c.json(error("VALIDATION_ERROR", "email is required"), 400);

  await requestMagicLink({ email, cfTurnstileToken, redirect }, buildAuthDeps(c));
  return c.json(success({ sent: true }), 200);
});

/** GET /api/auth/magic-link/verify?token= — exchange token for a JWT session */
magicLinkRoutes.get("/magic-link/verify", async (c) => {
  const token = c.req.query("token");
  if (!token) return c.json(error("VALIDATION_ERROR", "token is required"), 400);

  return runUseCase(c, async () => c.json(success(await verifyMagicLink(token, clientContext(c))), 200));
});
