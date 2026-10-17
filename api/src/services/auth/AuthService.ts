/**
 * Pure auth handlers — extracted from routes/auth.ts so the Hono layer is
 * only responsible for request/response plumbing, and every business rule
 * can be exercised with mocked dependencies.
 *
 * ─── Why split like this ────────────────────────────────────────────────
 * The original authRoutes.post("/register", async (c) => { ... })
 * handlers called `getDb()` and `sendVerificationEmail()` directly. That
 * pattern hard-codes infrastructure into the business logic and makes
 * SOLID tests impossible:
 *
 *   • Dependency Inversion — handlers should depend on abstractions (a
 *     db port, an email port) not concrete modules.
 *   • Single Responsibility — the handler's job is "given a request,
 *     produce a response"; starting a neon client or talking to
 *     SendPulse is a different concern.
 *   • Open/Closed — swapping the email provider shouldn't require
 *     touching the register handler.
 *
 * So: each public handler takes an `AuthDeps` bag and returns plain data
 * (throwing DomainError on a rule violation); the route maps it onto the
 * HTTP envelope. The Hono route passes the real deps; tests pass
 * fakes and assert both the response and the side effects recorded on
 * the fake deps.
 *
 * The schemas (./schemas), hashPassword/verifyPassword (./password) and
 * markUserLogin (./loginStamp) are pure service-layer modules, tested in
 * auth-schemas.test.ts.
 *
 * This file is a thin barrel (route files import from here). The use
 * cases live in cohesive modules:
 *   authPorts.ts     — AuthDeps + ports (Emailer/Onboarding/Captcha/Db)
 *   jwt.ts           — issueJwt + GUEST_TOKEN_TTL
 *   loginEvents.ts   — login_events telemetry
 *   register.ts      — handleRegister
 *   login.ts         — handleLogin
 *   passwordReset.ts — forgot/reset password + verify email
 */

export type { AuthDeps, CaptchaPort, DbPort, EmailerPort, OnboardingPort } from "./authPorts.js";
export { GUEST_TOKEN_TTL, issueJwt } from "./jwt.js";
export { handleRegister } from "./register.js";
export { handleLogin } from "./login.js";
export { handleForgotPassword, handleResetPassword, handleVerifyEmail } from "./passwordReset.js";
