/**
 * Auth request schemas — the service layer owns them so AuthService never
 * imports from routes/. routes/auth.ts validates with the same objects.
 */
import { z } from "zod";
import { isPublicSignupRole } from "../../../../shared/user-roles.js";

export const LoginSchema = z.object({
  email: z.string().email().transform((e) => e.toLowerCase()),
  password: z.string().min(6),
  // Cloudflare Turnstile token. Optional at the schema level so tests /
  // dev don't have to set up Turnstile, but `handleLogin` enforces
  // presence + validity when TURNSTILE_SECRET_KEY is set — same posture
  // as register.
  cfTurnstileToken: z.string().optional(),
});

export const RegisterSchema = z.object({
  email: z.string().email().transform((e) => e.toLowerCase()),
  password: z.string().min(8),
  // Accept either a single `name` field or `firstName`+`lastName` from the frontend.
  name: z.string().min(1).optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  // Canonical lower_snake values only — the schema no longer accepts
  // PascalCase. Clients must send the exact enum value shared via
  // shared/user-roles.ts. `creator` + `affiliate` are first-class roles
  // (promoted 2026-06-13) so growth/SaaS reports can GROUP BY role and
  // creator-only / affiliate-only accounts surface as themselves under
  // /people. `employee` stays invite-only (coerced to job_seeker if sent).
  // Validated against PUBLIC_SIGNUP_ROLES (the same SSoT the OAuth start
  // route uses) so a public POST can never self-assign `admin` /
  // `super_admin` / `employee` or a persona that is switched off.
  role: z
    .string()
    .default("job_seeker")
    .refine(isPublicSignupRole, { message: "Role is not available for public signup" }),
  // When true, auto-creates an affiliate profile for the new user. Typically
  // paired with `role: "affiliate"` from the affiliate-program page, but it
  // remains independent — any role can layer affiliate status on top.
  enableAffiliate: z.boolean().optional(),
  // Inbound referral attribution. The frontend captures `?ref=CODE` into
  // a first-touch cookie and ships it here; `handleRegister` resolves it
  // to an affiliate_profile and inserts an affiliate_referrals row.
  // 64-char cap mirrors `affiliate_profiles.referral_code`.
  referralCode: z.string().trim().min(1).max(64).optional(),
  // Inbound campaign attribution — captured from `utm_*` querystring on
  // first hit by useAttributionCapture, persisted onto the new user row.
  // 128-char cap mirrors `users.utm_*` columns from migration 0116.
  utmSource: z.string().trim().max(128).optional(),
  utmMedium: z.string().trim().max(128).optional(),
  utmCampaign: z.string().trim().max(128).optional(),
  utmTerm: z.string().trim().max(128).optional(),
  utmContent: z.string().trim().max(128).optional(),
  landingReferrer: z.string().trim().max(2048).optional(),
  // Cloudflare Turnstile token from the signup widget. Optional at the
  // schema level so tests / dev don't have to set up Turnstile, but the
  // handler enforces presence + validity when TURNSTILE_SECRET_KEY is set.
  cfTurnstileToken: z.string().optional(),
  // Honeypot field — hidden in the form, only filled by naive bots.
  // Any value (including empty string) is accepted at the schema layer;
  // the signup composer rejects when length > 0.
  website: z.string().optional(),
  // Pre-auth UI locale the visitor selected before submitting. Seeded
  // onto the `user_settings.language` column so the first authed render in
  // LocaleSync resolves to their pick instead of the DB default ("en").
  // Validated downstream via `canPickLocale` so anything outside the
  // PUBLIC_LOCALES whitelist is silently dropped (matches the existing
  // settings sanitizer posture).
  language: z.string().trim().max(16).optional(),
}).refine(
  (d) => d.name || (d.firstName || d.lastName),
  { message: "name or firstName/lastName is required", path: ["name"] },
);

export const ForgotPasswordSchema = z.object({
  email: z.string().email(),
  // Cloudflare Turnstile token. Optional at the schema level so tests /
  // dev don't have to set up Turnstile, but the handler treats a miss
  // as a SOFT signal (records bot_block_event, proceeds with the
  // always-200-no-enumeration response) per the visible-widget posture
  // on every unauthenticated entry form.
  cfTurnstileToken: z.string().optional(),
});

export const ResetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
});

export const VerifyEmailSchema = z.object({
  token: z.string().min(1),
});

export const VerifyTwoFactorSchema = z.object({
  tempAuthToken: z.string().min(1),
  verificationCode: z.string().min(1),
  // When true, mint the HMAC-signed trusted-device cookie so future
  // logins from this device skip MFA for 30 days.
  trustDevice: z.boolean().optional(),
});

export const ResendTwoFactorSchema = z.object({
  tempAuthToken: z.string().min(1),
});
