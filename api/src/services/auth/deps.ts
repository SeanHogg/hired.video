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
import type { AuthDeps, EmailerPort, OnboardingPort } from "./AuthService.js";

const emailer: EmailerPort = {
  sendVerification: sendVerificationEmail,
  sendResendVerification: sendResendVerificationEmail,
  sendPasswordReset: sendPasswordResetEmail,
  sendTwoFactor: sendTwoFactorEmail,
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

function getJwtSecret(): string {
  return process.env.JWT_SECRET || (globalThis as any).__ENV?.JWT_SECRET || "";
}

/** Build the real, infrastructure-backed AuthDeps for a single request.
 *  The `c` arg is a Hono context but we only read env flags from
 *  process.env — so the context is deliberately unused here. Kept in
 *  the signature for symmetry with other deps-factory functions that
 *  do need per-request state. */
export function buildAuthDeps(_c?: unknown): AuthDeps {
  return {
    db: getDb(),
    email: emailer,
    onboarding,
    jwtSecret: getJwtSecret(),
    now: () => new Date(),
    randomHex,
    isDev: process.env.NODE_ENV !== "production",
  };
}
