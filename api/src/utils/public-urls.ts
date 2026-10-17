/**
 * Single source of truth for the public frontend origin and the OAuth
 * redirect URIs derived from it.
 *
 * Why this exists:
 *   `FRONTEND_URL` may be unset, empty (wrangler.toml shipped `""` after the
 *   2026-10-03 account move dropped the overriding secret) or a comma list.
 *   Routes that interpolated `c.env.FRONTEND_URL` raw sent RELATIVE
 *   redirect_uris (`/studio/youtube/callback`) to Google and LinkedIn, which
 *   both reject them. Every caller resolves the origin here instead.
 */

import { getEnv } from "./env.js";

const DEFAULT_FRONTEND_URL = "https://hired.video";
const DEFAULT_API_URL = "https://api.hired.video";

/** Absolute frontend origin (first entry of FRONTEND_URL, no trailing slash). */
export function frontendBaseUrl(): string {
  const first = getEnv("FRONTEND_URL").split(",")[0]?.trim().replace(/\/+$/, "") ?? "";
  return /^https?:\/\//i.test(first) ? first : DEFAULT_FRONTEND_URL;
}

/**
 * Absolute public API origin (no trailing slash) — the host OAuth callbacks
 * and webhooks are registered against. `API_URL` (secret) wins, then the
 * `BASE_URL` var, then the production default.
 */
export function apiBaseUrl(): string {
  const raw = (getEnv("API_URL") || getEnv("BASE_URL")).trim().replace(/\/+$/, "");
  return raw || DEFAULT_API_URL;
}

/**
 * Public app origin for links that land on the SPA from outside (embed
 * loaders, claim/consent links). `PUBLIC_APP_URL` overrides; otherwise the
 * frontend origin.
 */
export function publicAppBaseUrl(): string {
  const override = getEnv("PUBLIC_APP_URL").trim().replace(/\/+$/, "");
  return override || frontendBaseUrl();
}

/** Publishing integrations whose OAuth consent returns to the SPA. */
export type IntegrationOAuthProvider = "youtube";

/**
 * The redirect_uri registered with the provider's console. The authorize
 * request and the code exchange MUST send the identical value, so both
 * derive it here — never from a client-supplied body field.
 */
export function integrationRedirectUri(provider: IntegrationOAuthProvider): string {
  return `${frontendBaseUrl()}/studio/${provider}/callback`;
}

// ============================================================================
// TRANSACTIONAL-EMAIL LINKS
// ============================================================================

/**
 * Origin embedded in transactional-email links: the first FRONTEND_URL
 * entry, trimmed, else the production default. Kept byte-compatible with
 * the pre-split email adapter (it does NOT strip a trailing slash or
 * require a scheme like `frontendBaseUrl()` does) — converging the two is
 * a deliberate behaviour change, not part of the structural split.
 */
export function emailLinkBaseUrl(): string {
  const frontendUrl = getEnv("FRONTEND_URL");
  return frontendUrl.split(",")[0]?.trim() || DEFAULT_FRONTEND_URL;
}

export function buildVerifyUrl(token: string): string {
  return `${emailLinkBaseUrl()}/verify-email?token=${encodeURIComponent(token)}`;
}

export function buildPasswordResetUrl(token: string): string {
  return `${emailLinkBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
}

export function buildInviteUrl(token: string): string {
  return `${emailLinkBaseUrl()}/accept-invitation?token=${encodeURIComponent(token)}`;
}

/** Reviewer share-link target — the unauthenticated feedback surface
 *  (`/r/:token`) a peer/mentor opens to leave comments on a shared item. */
export function buildReviewUrl(token: string): string {
  return `${emailLinkBaseUrl()}/r/${encodeURIComponent(token)}`;
}

/** One-tap "approve sign-in" link target for the email-2FA step-up
 *  (gap #2225). Lands on the frontend verifier page, which exchanges the
 *  signed token for a session via GET /api/auth/verify-2fa-link. */
export function buildTwoFactorApproveUrl(token: string): string {
  return `${emailLinkBaseUrl()}/auth/2fa-approve?token=${encodeURIComponent(token)}`;
}

/** `${FRONTEND_URL}/consent/video/<token>` — the candidate's public consent page. */
export function buildCandidateVideoConsentUrl(token: string): string {
  return `${emailLinkBaseUrl()}/consent/video/${encodeURIComponent(token)}`;
}

export function buildMagicLinkUrl(token: string): string {
  return `${emailLinkBaseUrl()}/auth/magic-link?token=${encodeURIComponent(token)}`;
}

/** Email-change step 1: the OLD address confirms the swap. */
export function buildEmailChangeConfirmCurrentUrl(token: string): string {
  return `${emailLinkBaseUrl()}/security/email-change/confirm-current?token=${encodeURIComponent(token)}`;
}

/** Email-change step 2: the NEW address proves ownership. */
export function buildEmailChangeConfirmNewUrl(token: string): string {
  return `${emailLinkBaseUrl()}/security/email-change/confirm-new?token=${encodeURIComponent(token)}`;
}

/** SuperAdmin moderation queue (content-flag heads-up emails). */
export function buildModerationQueueUrl(): string {
  return `${emailLinkBaseUrl()}/admin/moderation`;
}

/** Candidate screening portal. Uses the RAW `FRONTEND_URL` value and the
 *  raw token, exactly as the pre-split sender did (no comma split/default). */
export function buildScreeningUrl(token: string): string {
  return `${getEnv("FRONTEND_URL")}/screening/${token}`;
}
