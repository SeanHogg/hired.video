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
