/**
 * Maps a thrown error from `authService.register()` (or `useAuth().signup()`)
 * to the i18n key that should be shown to the user. Centralised here so
 * Signup.tsx, AffiliateProgram.tsx, and any future signup surface stay in
 * lockstep with the server's bot-block reasons.
 *
 * The api-client wraps unknown error codes into `NetworkError` with the
 * server's machine-readable code stored under `context.serverCode`. This
 * mapper looks up that code and returns the matching key — falling back to
 * the generic message when the code is missing or unrecognised.
 */

import type { AppError } from "../errors";

export type SignupBlockReason =
  | "TURNSTILE_FAIL"
  | "HONEYPOT_HIT"
  | "DISPOSABLE_EMAIL"
  | "OFAC_BLOCKED"
  | "GEO_BLOCKED"
  | "MX_FAIL"
  | "BREACHED_PASSWORD"
  | "RATE_LIMIT"
  | "CONFLICT";

const KEY_BY_CODE: Record<SignupBlockReason, string> = {
  TURNSTILE_FAIL: "errors.captchaExpired",
  HONEYPOT_HIT: "errors.captchaExpired",
  DISPOSABLE_EMAIL: "errors.disposableEmail",
  OFAC_BLOCKED: "errors.regionBlocked",
  GEO_BLOCKED: "errors.regionWaitlist",
  MX_FAIL: "errors.emailUndeliverable",
  BREACHED_PASSWORD: "errors.passwordBreached",
  RATE_LIMIT: "errors.tooManyAttempts",
  CONFLICT: "errors.emailExists",
};

export interface SignupErrorInfo {
  code: SignupBlockReason | "UNKNOWN";
  messageKey: string;
}

export function mapSignupError(err: unknown): SignupErrorInfo {
  if (err && typeof err === "object" && "context" in err) {
    const ctx = (err as AppError).context as Record<string, unknown> | undefined;
    const serverCode = ctx?.serverCode;
    if (typeof serverCode === "string" && serverCode in KEY_BY_CODE) {
      const code = serverCode as SignupBlockReason;
      return { code, messageKey: KEY_BY_CODE[code] };
    }
  }
  return { code: "UNKNOWN", messageKey: "errors.generic" };
}
