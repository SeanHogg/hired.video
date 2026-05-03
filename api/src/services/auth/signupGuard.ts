/**
 * validateSignupRequest — single composer that runs every signup gate
 * in priority order. The handleRegister handler calls this fn and
 * either proceeds or short-circuits on the returned `block` value.
 *
 * Order matters:
 *   1. OFAC sanctions      — hardest, cheapest. Run first.
 *   2. Geo allowlist       — rejects with waitlist signal.
 *   3. Honeypot field      — naive bots only; cheap.
 *   4. Disposable email    — local set lookup.
 *   5. Per-email rate      — Workers Rate Limit binding (if available).
 *   6. Captcha (Turnstile) — external but cheap.
 *   7. MX record DNS check — external; can fail-open.
 *   8. Breached password   — external HIBP; can fail-open.
 *
 * Each block writes one bot_block_events row with the matching reason
 * — no caller has to remember to log.
 *
 * DRY anchor: every consumer (current signup handler, future
 * "request access" form, future signup-while-anonymous flows) calls
 * this fn rather than reimplementing the layered check.
 */

import { recordBotBlock, type BotBlockReason } from "./botBlock.js";
import { isDisposableEmail } from "./disposableEmail.js";
import { verifyMxRecord } from "./mxCheck.js";
import { isBreachedPassword } from "./breachCheck.js";
import { canCreateAccount, isSanctioned } from "./geo.js";
import type { CaptchaPort } from "./AuthService.js";

// External-call ports — injectable so tests can stub MX/HIBP without
// hitting DoH or HIBP. Production paths use the real implementations
// re-exported below; tests pass a no-op port that returns "ok" for both.
export interface MxCheckPort {
  verify(email: string): Promise<boolean>;
}
export interface BreachCheckPort {
  isBreached(password: string): Promise<boolean>;
}

export const realMxCheck: MxCheckPort = { verify: verifyMxRecord };
export const realBreachCheck: BreachCheckPort = { isBreached: (p) => isBreachedPassword(p) };
export const noopMxCheck: MxCheckPort = { verify: async () => true };
export const noopBreachCheck: BreachCheckPort = { isBreached: async () => false };

export type SignupBlockReason = BotBlockReason;

export interface SignupRequest {
  email: string;
  password: string;
  honeypot?: string | null;
  cfTurnstileToken?: string | null;
  countryCode?: string | null;
  ipAddress?: string | null;
}

export interface ValidateSignupDeps {
  db: any;
  captcha: CaptchaPort;
  endpoint: string;
  // Optional ports — if omitted, the real implementations are used.
  // Tests inject `noopMxCheck` / `noopBreachCheck` to skip the
  // network-dependent gates while still asserting on order.
  mxCheck?: MxCheckPort;
  breachCheck?: BreachCheckPort;
}

export interface ValidateSignupResult {
  ok: boolean;
  reason?: SignupBlockReason;
  message?: string;
}

export async function validateSignupRequest(
  deps: ValidateSignupDeps,
  req: SignupRequest,
): Promise<ValidateSignupResult> {
  const block = async (
    reason: SignupBlockReason,
    message: string,
  ): Promise<ValidateSignupResult> => {
    await recordBotBlock({
      db: deps.db,
      endpoint: deps.endpoint,
      reason,
      countryCode: req.countryCode ?? null,
      ipAddress: req.ipAddress ?? null,
      email: req.email,
    });
    return { ok: false, reason, message };
  };

  if (isSanctioned(req.countryCode)) {
    return block("OFAC_BLOCKED", "Account creation is not available in your region.");
  }

  if (!canCreateAccount(req.countryCode)) {
    return block(
      "GEO_BLOCKED",
      "We're not yet available in your region. Join the waitlist to be notified when we expand.",
    );
  }

  if (req.honeypot && req.honeypot.length > 0) {
    return block("HONEYPOT_HIT", "Captcha verification failed. Please retry.");
  }

  if (isDisposableEmail(req.email)) {
    return block("DISPOSABLE_EMAIL", "Please use a permanent email address.");
  }

  if (deps.captcha.enforced) {
    const passed = await deps.captcha.verify(req.cfTurnstileToken ?? null, req.ipAddress ?? null);
    if (!passed) {
      return block("TURNSTILE_FAIL", "Captcha verification failed. Please retry.");
    }
  }

  const mx = deps.mxCheck ?? realMxCheck;
  const mxOk = await mx.verify(req.email);
  if (!mxOk) {
    return block(
      "MX_FAIL",
      "We can't deliver email to that address. Check the spelling and try again.",
    );
  }

  const breach = deps.breachCheck ?? realBreachCheck;
  if (await breach.isBreached(req.password)) {
    return block(
      "BREACHED_PASSWORD",
      "This password has appeared in a known data breach. Please choose a different one.",
    );
  }

  return { ok: true };
}
