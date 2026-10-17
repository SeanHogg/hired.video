/**
 * Bearer-token session/account endpoints: refresh, logout, me,
 * verification-status, resend-email-verification. /api/auth bypasses the
 * JWT middleware, so each verifies its own `Authorization: Bearer` header
 * (see withBearerToken for the 401 contract).
 */

import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { success } from "../../types/index.js";
import {
  refreshAccessToken,
  getVerificationStatus,
  getCurrentUser,
  resendEmailVerification,
} from "../../services/auth/bearerAccount.js";
import { withBearerToken, deferTask } from "./http.js";

export const sessionRoutes = new Hono<AppEnv>();

/** POST /api/auth/refresh — re-issue a token from a valid existing one */
sessionRoutes.post("/refresh", (c) =>
  withBearerToken(c, async (token) => c.json(success(await refreshAccessToken(token)))),
);

/** POST /api/auth/logout — stateless; client discards token */
sessionRoutes.post("/logout", (c) => {
  return c.json(success(null, "Logged out successfully"));
});

/** GET /api/auth/verification-status */
sessionRoutes.get("/verification-status", (c) =>
  withBearerToken(c, async (token) => c.json(success(await getVerificationStatus(token)), 200)),
);

/** POST /api/auth/resend-email-verification */
sessionRoutes.post("/resend-email-verification", (c) =>
  withBearerToken(c, async (token) => {
    const result = await resendEmailVerification(token, deferTask(c));
    if (result.alreadyVerified) return c.json(success({ resent: false }, "Email already verified"), 200);
    return c.json(
      success(result.devToken !== null ? { verificationToken: result.devToken } : null, "Verification email sent"),
      200,
    );
  }),
);

/** GET /api/auth/me — requires valid JWT passed as Authorization header */
sessionRoutes.get("/me", (c) =>
  withBearerToken(c, async (token) => c.json(success(await getCurrentUser(token)))),
);
