/**
 * Maps a thrown error from `authService.register()` / `authService.login()`
 * (or `useAuth().signup()` / `.login()`) to the i18n key that should be
 * shown to the user. Centralised here so every auth-form surface stays in
 * lockstep with the server's bot-block + auth-failure reasons.
 *
 * The api-client wraps unknown error codes into `NetworkError` with the
 * server's machine-readable code stored under `context.serverCode`. This
 * mapper looks up that code and returns the matching key — falling back to
 * the generic message when the code is missing or unrecognised.
 *
 * Some codes (DISPOSABLE_EMAIL, OFAC_BLOCKED, MX_FAIL, BREACHED_PASSWORD,
 * CONFLICT) only fire on signup; others (UNAUTHORIZED, ACCOUNT_LOCKED) only
 * on login. Both forms share the bot-block codes (TURNSTILE_FAIL,
 * HONEYPOT_HIT, GEO_BLOCKED, RATE_LIMIT) — keeping them in one map means
 * the captcha-recovery copy and rate-limit copy can never drift.
 */

import type { AppError } from "../errors";

export type AuthBlockReason =
  // Shared bot-block / abuse-prevention reasons
  | "TURNSTILE_FAIL"
  | "HONEYPOT_HIT"
  | "GEO_BLOCKED"
  | "RATE_LIMIT"
  // Signup-only
  | "DISPOSABLE_EMAIL"
  | "OFAC_BLOCKED"
  | "MX_FAIL"
  | "BREACHED_PASSWORD"
  | "CONFLICT"
  // Login-only
  | "UNAUTHORIZED"
  | "AUTHENTICATION_ERROR"
  | "ACCOUNT_LOCKED";

const KEY_BY_CODE: Record<AuthBlockReason, string> = {
  // Bot-block / shared
  TURNSTILE_FAIL: "errors.captchaExpired",
  HONEYPOT_HIT: "errors.captchaExpired",
  GEO_BLOCKED: "errors.regionWaitlist",
  RATE_LIMIT: "errors.tooManyAttempts",
  // Signup-only
  DISPOSABLE_EMAIL: "errors.disposableEmail",
  OFAC_BLOCKED: "errors.regionBlocked",
  MX_FAIL: "errors.emailUndeliverable",
  BREACHED_PASSWORD: "errors.passwordBreached",
  CONFLICT: "errors.emailExists",
  // Login-only
  UNAUTHORIZED: "errors.invalidCredentials",
  AUTHENTICATION_ERROR: "errors.invalidCredentials",
  ACCOUNT_LOCKED: "errors.accountLocked",
};

export interface AuthErrorInfo {
  code: AuthBlockReason | "UNKNOWN";
  messageKey: string;
}

export function mapAuthError(err: unknown): AuthErrorInfo {
  if (err && typeof err === "object") {
    // AppError subclasses with a typed code (AuthenticationError, etc.)
    // expose `.code` directly. Check it first.
    const directCode = (err as AppError).code;
    if (typeof directCode === "string" && directCode in KEY_BY_CODE) {
      const code = directCode as AuthBlockReason;
      return { code, messageKey: KEY_BY_CODE[code] };
    }
    // Fall through to the context.serverCode stash that NetworkError uses
    // for codes the api-client doesn't have a dedicated AppError class for.
    if ("context" in err) {
      const ctx = (err as AppError).context as Record<string, unknown> | undefined;
      const serverCode = ctx?.serverCode;
      if (typeof serverCode === "string" && serverCode in KEY_BY_CODE) {
        const code = serverCode as AuthBlockReason;
        return { code, messageKey: KEY_BY_CODE[code] };
      }
    }
  }
  return { code: "UNKNOWN", messageKey: "errors.generic" };
}
