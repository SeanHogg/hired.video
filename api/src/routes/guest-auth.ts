/**
 * /api/auth/guest — silent guest accounts (mig 0496).
 *
 *   POST /        → mint a guest user + JWT for a signed-out visitor. Public
 *                   (under the /api/auth public prefix), IP rate-limited.
 *   POST /adopt   → a REAL signed-in user claims the guest behind
 *                   `{ guestToken }`: its projects, videos, resumes and social
 *                   connections move onto the caller and the guest is deleted.
 *
 * Domain logic lives in services/auth/guest-accounts.ts; this file is HTTP.
 */
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { authMiddleware } from "../middleware/auth.js";
import { createIpRateLimiter, getClientIp } from "../middleware/rateLimiter.js";
import { adoptGuestAccount, createGuestAccount } from "../services/auth/guest-accounts.js";
import { validateJson } from "./helpers/validate.js";

export const guestAuthRoutes = new Hono<AppEnv>();

// One browser keeps its guest token, so a handful per network per hour is
// generous; the cap stops scripted guest farming of free-tier allowances.
const guestCreateLimiter = createIpRateLimiter({
  windowMs: 60 * 60 * 1000,
  maxAttempts: 10,
  message: "Too many new sessions from this network. Create a free account to keep going.",
});

guestAuthRoutes.post("/", guestCreateLimiter, async (c) => {
  const account = await createGuestAccount({
    ipAddress: getClientIp(c),
    userAgent: c.req.header("user-agent") ?? null,
  });
  return c.json(success(account), 201);
});

const AdoptSchema = z.object({ guestToken: z.string().min(20).max(4096) });

guestAuthRoutes.post("/adopt", authMiddleware, validateJson(AdoptSchema, () => error("VALIDATION_ERROR", "guestToken is required."), { emptyBody: null }), async (c) => {
  const user = c.var.user;
  if (!user || user.guest) {
    return c.json(error("FORBIDDEN", "Sign in to a full account to claim guest work."), 403);
  }
  const body = c.req.valid("json");
  const result = await adoptGuestAccount(body.guestToken, user.sub);
  return c.json(success(result));
});
