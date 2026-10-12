/**
 * Production wiring for AuthDeps — builds the concrete adapters for
 * each port (db, emailer, onboarding, jwt, clock, randomness).
 *
 * Kept in its own file so route handlers don't import email + db +
 * onboarding modules at the top of auth.ts (Interface Segregation).
 * Tests never import from here; they build their own fakes directly.
 */

import { getDb } from "../../db/index.js";
import {
  sendVerificationEmail,
  sendResendVerificationEmail,
  sendPasswordResetEmail,
  sendTwoFactorEmail,
  sendMagicLinkEmail,
} from "../../services/adapters/email.js";
import { seedOnboardingTasks } from "../../lib/onboarding.js";
import { triggerOnboardingDrip } from "../../lib/onboardingDrip.js";
import type { AuthDeps, CaptchaPort, EmailerPort, OnboardingPort } from "./AuthService.js";
import { detectCountry } from "./geo.js";
import { verifyTrustedDeviceCookie } from "./trustedDevice.js";
import { realMxCheck, realBreachCheck } from "./signupGuard.js";
import { getJwtSecret } from "../../utils/jwt.js";
import { isDevEnvironment } from "../../utils/runtime-env.js";

const emailer: EmailerPort = {
  sendVerification: sendVerificationEmail,
  sendResendVerification: sendResendVerificationEmail,
  sendPasswordReset: sendPasswordResetEmail,
  // Adapt the email fn's (…, expiryMinutes, approveToken) shape to the
  // port's (…, approveToken) — the port stays free of the 10-min expiry
  // impl detail, and the one-tap approve token threads through.
  sendTwoFactor: (to, name, code, approveToken) => sendTwoFactorEmail(to, name, code, 10, approveToken),
  sendMagicLink: sendMagicLinkEmail,
};

const onboarding: OnboardingPort = {
  seedTasks: seedOnboardingTasks,
  triggerDrip: triggerOnboardingDrip,
};

/** Produce random hex bytes. Uses Web Crypto (available in CF Workers + Node 22+). */
function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function getTurnstileSecret(): string {
  return process.env.TURNSTILE_SECRET_KEY || (globalThis as any).__ENV?.TURNSTILE_SECRET_KEY || "";
}

const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Cloudflare Turnstile adapter. When no secret is configured, returns a
 *  no-op port (`enforced=false`) so handlers skip the check — keeps local
 *  dev / tests frictionless. In production the secret MUST be set, or
 *  signup degrades to no-bot-protection. */
function buildCaptcha(): CaptchaPort {
  const secret = getTurnstileSecret();
  if (!secret) {
    return {
      enforced: false,
      verify: async () => true,
    };
  }
  return {
    enforced: true,
    verify: async (token, clientIp) => {
      if (!token) return false;
      try {
        const form = new URLSearchParams({ secret, response: token });
        if (clientIp) form.set("remoteip", clientIp);
        const res = await fetch(TURNSTILE_VERIFY_URL, {
          method: "POST",
          body: form,
        });
        if (!res.ok) return false;
        const json = (await res.json()) as { success?: boolean };
        return json.success === true;
      } catch (err) {
        // Network / Turnstile outage — fail closed to keep spam out. If
        // this becomes a reliability problem we can switch to fail-open
        // with a separate alarm, but the safer default is reject.
        console.error("[captcha] Turnstile verify failed:", err);
        return false;
      }
    },
  };
}

const captcha = buildCaptcha();

/** Extract the caller's IP from common proxy headers, in priority order:
 *  CF-Connecting-IP (Cloudflare), then the first hop in X-Forwarded-For.
 *  Returns null when neither is present (direct/local requests). */
function extractClientIp(c: any): string | null {
  if (!c?.req?.header) return null;
  const cf = c.req.header("CF-Connecting-IP");
  if (cf) return cf.trim();
  const xff = c.req.header("X-Forwarded-For");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return null;
}

function extractUserAgent(c: any): string | null {
  if (!c?.req?.header) return null;
  const ua = c.req.header("User-Agent");
  return ua ? ua.slice(0, 1024) : null; // cap so a hostile UA can't blow the row size
}

function extractIpCountry(c: any): string | null {
  if (!c?.req?.header) return null;
  const headerLike = {
    get: (name: string) => (c.req.header(name) as string | null) ?? null,
  };
  return detectCountry(headerLike);
}

function extractTrustedDeviceCookie(c: any): string | null {
  if (!c?.req?.header) return null;
  const cookie = c.req.header("Cookie");
  if (!cookie) return null;
  const match = cookie.match(/(?:^|;\s*)hv_trusted_device=([^;]+)/);
  return match ? decodeURIComponent(match[1]!) : null;
}

/** Build the real, infrastructure-backed AuthDeps for a single request. */
export function buildAuthDeps(c?: unknown): AuthDeps {
  const ipCountry = extractIpCountry(c);
  const cookieValue = extractTrustedDeviceCookie(c);
  const trustedDevicePresent = cookieValue ? verifyTrustedDeviceCookie(cookieValue) : false;
  return {
    db: getDb(),
    email: emailer,
    onboarding,
    captcha,
    jwtSecret: getJwtSecret(),
    now: () => new Date(),
    randomHex,
    isDev: isDevEnvironment(),
    clientIp: extractClientIp(c),
    userAgent: extractUserAgent(c),
    ipCountry,
    trustedDevicePresent,
    mxCheck: realMxCheck,
    breachCheck: realBreachCheck,
  };
}
