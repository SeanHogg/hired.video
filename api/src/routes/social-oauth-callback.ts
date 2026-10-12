/**
 * The ONE social OAuth callback handler, shared by the self flow
 * (/api/social/oauth/callback) and the managed brand-account flow
 * (/api/admin/social/oauth/callback).
 *
 * The signed `state` is verified BEFORE anything else, so every outcome,
 * success OR failure, returns the browser to the page that started the
 * connect (e.g. /studio/linkedin/callback). Only a missing/forged/expired
 * state falls back to the flow's fixed page, because then there's no trusted
 * return target.
 *
 * `reason` is always a stable code (never a raw exception message, which used
 * to leak env-var names to users); the detail goes to the Worker log.
 */
import type { Context } from "hono";
import type { AppEnv } from "../types/index.js";
import { frontendBaseUrl } from "../utils/public-urls.js";
import { socialConnectionServiceFor } from "../services/social/social-connection-factory.js";
import { SocialConnectionError } from "../services/social/social-connection-service.js";
import { SecretsError } from "../services/social/secrets.js";
import type { SocialOAuthState } from "../services/social/social-oauth.js";

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

export interface SocialCallbackOptions {
  /** Which signed-state scope this endpoint accepts. */
  scope: SocialOAuthState["scope"];
  /** Frontend path used when there is no trusted state to return to. */
  fallbackPath: string;
}

export function socialOAuthCallbackHandler(opts: SocialCallbackOptions) {
  return async (c: Context<AppEnv>) => {
    const fallback = `${frontendBaseUrl()}${opts.fallbackPath}`;
    const service = socialConnectionServiceFor(c.env);

    const rawState = c.req.query("state");
    const verified = rawState ? await service.verifyCallbackState(rawState) : null;
    if (!verified || verified.scope !== opts.scope) {
      return c.redirect(withParams(fallback, { status: "error", reason: "invalid_state" }));
    }

    const target = verified.redirectTo || fallback;
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
      console.error(`[social-oauth] ${verified.scope} ${verified.platform} callback failed:`, err);
      return back("error", { reason: socialCallbackFailureReason(err) });
    }
  };
}
