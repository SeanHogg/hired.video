/**
 * Login two-factor endpoints: verify-2fa (code / TOTP / backup code),
 * verify-2fa-link (one-tap email approve, gap #2225), resend-2fa.
 * Rules live in services/auth/twoFactorChallenge.ts.
 */

import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import { VerifyTwoFactorSchema, ResendTwoFactorSchema } from "../../services/auth/schemas.js";
import {
  verifyTwoFactorChallenge,
  approveTwoFactorLink,
  resendTwoFactorChallenge,
} from "../../services/auth/twoFactorChallenge.js";
import { runUseCase, clientContext, deferTask } from "./http.js";

const TRUSTED_DEVICE_MAX_AGE_S = 30 * 24 * 60 * 60;

export const twoFactorRoutes = new Hono<AppEnv>();

/** POST /api/auth/verify-2fa */
twoFactorRoutes.post("/verify-2fa", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = VerifyTwoFactorSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request body", { issues: parsed.error.flatten() }), 400);
  }

  return runUseCase(c, async () => {
    const { payload, trustedDeviceCookie } = await verifyTwoFactorChallenge(parsed.data, clientContext(c));
    if (trustedDeviceCookie !== null) {
      c.header(
        "Set-Cookie",
        `hv_trusted_device=${encodeURIComponent(trustedDeviceCookie)}; Path=/; Max-Age=${TRUSTED_DEVICE_MAX_AGE_S}; HttpOnly; Secure; SameSite=Lax`,
        { append: true },
      );
    }
    return c.json(success(payload), 200);
  });
});

/** GET /api/auth/verify-2fa-link?token= — the signed token in the email
 *  link finalizes the pending challenge (untrusted session). */
twoFactorRoutes.get("/verify-2fa-link", async (c) => {
  const token = c.req.query("token");
  if (!token) return c.json(error("VALIDATION_ERROR", "token is required"), 400);

  return runUseCase(c, async () => {
    const payload = await approveTwoFactorLink(token, clientContext(c));
    return c.json(success({ ...payload, redirect: "/dashboard" }), 200);
  });
});

/** POST /api/auth/resend-2fa */
twoFactorRoutes.post("/resend-2fa", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = ResendTwoFactorSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request body", { issues: parsed.error.flatten() }), 400);
  }

  return runUseCase(c, async () =>
    c.json(success(await resendTwoFactorChallenge(parsed.data.tempAuthToken, deferTask(c))), 200),
  );
});
