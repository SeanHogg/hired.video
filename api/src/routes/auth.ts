/**
 * /api/auth composition root (the whole prefix bypasses the JWT middleware;
 * /api/auth/passkey, /oauth and /guest are mounted from their own files).
 *
 * Sub-routers (routes/auth/):
 *   • credentials.ts  — register, login, forgot/reset-password, verify-email
 *   • session.ts      — refresh, logout, me, verification-status,
 *                       resend-email-verification (bearer-token endpoints)
 *   • two-factor.ts   — verify-2fa, verify-2fa-link, resend-2fa
 *   • magic-link.ts   — magic-link, magic-link/verify
 *   • email-change.ts — email-change/request, confirm-current, confirm-new
 *   • http.ts         — shared adapters (DomainError render, bearer 401s)
 *
 * Use cases: services/auth/{AuthService,bearerAccount,twoFactorChallenge,
 * magicLink,emailChangeFlow}.ts; data access: repositories/authFlowRepository.ts.
 * No path overlaps between sub-routers, so mount order carries no precedence.
 */

import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { credentialRoutes } from "./auth/credentials.js";
import { sessionRoutes } from "./auth/session.js";
import { twoFactorRoutes } from "./auth/two-factor.js";
import { magicLinkRoutes } from "./auth/magic-link.js";
import { emailChangeRoutes } from "./auth/email-change.js";

// Pinned by routes/__tests__/auth-resend-2fa.test.ts.
export { canResendTwoFactor } from "../services/auth/twoFactorChallenge.js";

export const authRoutes = new Hono<AppEnv>()
  .route("/", credentialRoutes)
  .route("/", sessionRoutes)
  .route("/", twoFactorRoutes)
  .route("/", magicLinkRoutes)
  .route("/", emailChangeRoutes);
