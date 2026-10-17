/**
 * The ONE social OAuth callback handler, for both lanes. Mounted at
 * /api/social/oauth/callback (routes/social.ts) and, as an explicit alias,
 * at /api/admin/social/oauth/callback (app.ts) — that second path is the
 * managed-lane redirect URI registered in each provider's developer console
 * (see socialCallbackUrl in services/social/social-oauth.ts and the
 * wrangler.toml secrets notes), so it must keep resolving.
 *
 * The lane/scope comes from the signed `state`, never from the path. A
 * managed-scope state can only have been minted by the SuperAdmin-gated
 * `GET /api/social/:platform/auth-url?lane=managed`.
 *
 * The signed `state` is verified BEFORE anything else, so every outcome,
 * success OR failure, returns the browser to the page that started the
 * connect (e.g. /studio/linkedin/callback). Only a missing/forged/expired
 * state falls back to a fixed page, because then there's no trusted
 * return target.
 *
 * `reason` is always a stable code (never a raw exception message, which used
 * to leak env-var names to users); the detail goes to the Worker log.
 */
import { Hono, type Context } from "hono";
import type { AppEnv } from "../types/index.js";
import { frontendBaseUrl } from "../utils/public-urls.js";
import { socialConnectionServiceFor } from "../services/social/social-connection-factory.js";
import { SocialConnectionError } from "../services/social/social-connection-service.js";
import { SecretsError } from "../services/social/secrets.js";
import type { SocialOAuthState } from "../services/social/social-oauth.js";
import { logger } from "../lib/logger.js";

/** Mirrors the frontend's IntegrationOAuthFailure (lib/studio/integration-oauth.ts). */
export type SocialCallbackFailure =
  | "denied"
  | "invalid_state"
  | "scopes_not_granted"
  | "not_configured"
  | "exchange_failed";

export function socialCallbackFailureReason(err: unknown): SocialCallbackFailure {
  if (err instanceof SocialConnectionError) {
    if (err.code === "SCOPES_NOT_GRANTED") return "scopes_not_granted";
    if (err.code === "NOT_CONFIGURED") return "not_configured";
  }
  if (err instanceof SecretsError && err.reason === "NOT_CONFIGURED") return "not_configured";
  return "exchange_failed";
}

function withParams(target: string, params: Record<string, string | null | undefined>): string {
  const url = new URL(target, frontendBaseUrl());
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
  return url.toString();
}

/** Frontend page each scope falls back to when the state carries no target. */
export const SOCIAL_CALLBACK_FALLBACK_PATH: Record<SocialOAuthState["scope"], string> = {
  self: "/settings/connections",
  managed: "/admin/social-accounts",
};

export async function socialOAuthCallbackHandler(c: Context<AppEnv>) {
  const service = socialConnectionServiceFor(c.env);

  const rawState = c.req.query("state");
  const verified = rawState ? await service.verifyCallbackState(rawState) : null;
  if (!verified) {
    const fallback = `${frontendBaseUrl()}${SOCIAL_CALLBACK_FALLBACK_PATH.self}`;
    return c.redirect(withParams(fallback, { status: "error", reason: "invalid_state" }));
  }

  const target = verified.redirectTo || `${frontendBaseUrl()}${SOCIAL_CALLBACK_FALLBACK_PATH[verified.scope]}`;
  const back = (status: "connected" | "error", extra: Record<string, string | null | undefined> = {}) =>
    c.redirect(withParams(target, { status, platform: verified.platform, ...extra }));

  // Consent screen cancelled / denied (or the provider rejected the request).
  const code = c.req.query("code");
  if (c.req.query("error") || !code) {
    return back("error", { reason: "denied" });
  }

  try {
    const { handle } = await service.completeCallback(verified, code);
    return back("connected", { handle });
  } catch (err) {
    logger.error("[social-oauth] callback failed", { scope: verified.scope, platform: verified.platform, error: err });
    return back("error", { reason: socialCallbackFailureReason(err) });
  }
}

/** GET /api/admin/social/oauth/callback — the provider-registered managed-lane
 *  redirect URI (see the header). An alias of the same handler, nothing more. */
export const managedOAuthCallbackAliasRoutes = new Hono<AppEnv>();
managedOAuthCallbackAliasRoutes.get("/callback", socialOAuthCallbackHandler);
