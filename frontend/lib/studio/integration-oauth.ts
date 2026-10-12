/**
 * Publishing-integration OAuth (YouTube + the social networks) — the ONE client flow for
 * "connect an account to post to". Every surface starts consent through
 * `beginIntegrationOAuth`, the provider returns to `/studio/:provider/callback`
 * (IntegrationOAuthCallback page), which verifies `state`, exchanges the code
 * and broadcasts the result. Surfaces listen with `useIntegrationOAuthLinked`.
 *
 * Adding a provider = one entry in INTEGRATION_OAUTH_EXCHANGERS (plus the
 * server's `integrationRedirectUri`), never a new callback page.
 *
 * Social networks (TikTok, Instagram, X, Facebook, LinkedIn) run their exchange on the
 * SERVER (/api/social — signed state, encrypted tokens), which then returns
 * the browser to this same callback page with `?status=connected`. For those
 * the page only reads the status and broadcasts it; there is no code to
 * exchange and no client-side state (`beginIntegrationOAuth` isn't used).
 */
import { useEffect, useRef } from "react";
import { youtubeService } from "@/lib/services/youtube-service";
import { isSocialPostPlatform, type SocialPostPlatform } from "@shared/social-platforms";
import { serverErrorCode } from "@/lib/errors";

/** Providers whose code this page exchanges. */
type ClientExchangedProvider = "youtube";
export type IntegrationOAuthProvider = ClientExchangedProvider | SocialPostPlatform;

const INTEGRATION_OAUTH_EXCHANGERS: Record<ClientExchangedProvider, (code: string) => Promise<unknown>> = {
  youtube: (code) => youtubeService.handleCallback(code),
};

function isClientExchanged(value: string): value is ClientExchangedProvider {
  return Object.prototype.hasOwnProperty.call(INTEGRATION_OAUTH_EXCHANGERS, value);
}

export function isIntegrationOAuthProvider(value: string | undefined): value is IntegrationOAuthProvider {
  return !!value && (isClientExchanged(value) || isSocialPostPlatform(value));
}

/** Where a server-exchanged provider's consent should return (this page). */
export function integrationCallbackUrl(provider: IntegrationOAuthProvider): string {
  return `${window.location.origin}/studio/${provider}/callback`;
}

interface PendingAuth {
  state: string;
  /** Set for full-page redirects; popups broadcast and close instead. */
  returnTo?: string;
}

const CHANNEL = "integration-oauth";
const storageKey = (provider: ClientExchangedProvider) => `integration-oauth:${provider}`;

/**
 * Stamp a fresh `state` onto the provider's consent URL and remember it so
 * the callback can reject codes this browser never asked for (login CSRF).
 * localStorage (not sessionStorage) because the consent popup is a separate
 * browsing context.
 */
export function beginIntegrationOAuth(
  provider: ClientExchangedProvider,
  authUrl: string,
  returnTo?: string,
): string {
  const state = crypto.randomUUID();
  const url = new URL(authUrl);
  url.searchParams.set("state", state);
  try {
    localStorage.setItem(storageKey(provider), JSON.stringify({ state, returnTo } satisfies PendingAuth));
  } catch {
    // Storage blocked: the callback will fail the state check and say so.
  }
  return url.toString();
}

function takePendingAuth(provider: ClientExchangedProvider): PendingAuth | null {
  try {
    const raw = localStorage.getItem(storageKey(provider));
    localStorage.removeItem(storageKey(provider));
    return raw ? (JSON.parse(raw) as PendingAuth) : null;
  } catch {
    return null;
  }
}

/** Mirrors the server's SocialCallbackFailure (api/src/routes/social-oauth-callback.ts). */
export type IntegrationOAuthFailure =
  | "denied"
  | "invalid_state"
  | "scopes_not_granted"
  | "not_configured"
  | "exchange_failed";

export type IntegrationOAuthOutcome =
  | { ok: true; returnTo?: string }
  | { ok: false; reason: IntegrationOAuthFailure; returnTo?: string };

const FAILURE_KEYS: Record<IntegrationOAuthFailure, string> = {
  denied: "integrationOAuth.denied",
  invalid_state: "integrationOAuth.invalidState",
  scopes_not_granted: "integrationOAuth.scopesNotGranted",
  not_configured: "integrationOAuth.notConfigured",
  exchange_failed: "integrationOAuth.failed",
};

function isIntegrationOAuthFailure(reason: string | null | undefined): reason is IntegrationOAuthFailure {
  return !!reason && Object.prototype.hasOwnProperty.call(FAILURE_KEYS, reason);
}

/** i18n key for a failure reason — also accepts the raw `<provider>_error` /
 *  `reason` query value a full-page return carries (unknown → generic). */
export function integrationOAuthErrorKey(reason: string | null | undefined): string {
  return isIntegrationOAuthFailure(reason) ? FAILURE_KEYS[reason] : FAILURE_KEYS.exchange_failed;
}

/** Human-readable `reason` query value: localized when it's a known failure
 *  code, otherwise the provider's own text (already human, e.g. "access_denied"). */
export function integrationOAuthReasonText(reason: string, t: (key: string) => string): string {
  return isIntegrationOAuthFailure(reason) ? t(FAILURE_KEYS[reason]) : reason;
}

/** Verify state, exchange the code and broadcast the outcome to open tabs. */
export async function completeIntegrationOAuth(
  provider: IntegrationOAuthProvider,
  params: URLSearchParams,
): Promise<IntegrationOAuthOutcome> {
  if (!isClientExchanged(provider)) {
    // The server already verified state and stored the tokens (or says why not).
    const reason = params.get("reason");
    const outcome: IntegrationOAuthOutcome =
      params.get("status") === "connected"
        ? { ok: true }
        : { ok: false, reason: isIntegrationOAuthFailure(reason) ? reason : "exchange_failed" };
    broadcast(provider, outcome.ok);
    return outcome;
  }
  const pending = takePendingAuth(provider);
  const returnTo = pending?.returnTo;
  const code = params.get("code");
  let outcome: IntegrationOAuthOutcome;
  if (params.get("error") || !code) {
    outcome = { ok: false, reason: "denied", returnTo };
  } else if (!pending || pending.state !== params.get("state")) {
    outcome = { ok: false, reason: "invalid_state", returnTo };
  } else {
    try {
      await INTEGRATION_OAUTH_EXCHANGERS[provider](code);
      outcome = { ok: true, returnTo };
    } catch (err) {
      // Google granular consent: Continue clicked without ticking the boxes.
      const reason = serverErrorCode(err) === "SCOPES_NOT_GRANTED" ? "scopes_not_granted" : "exchange_failed";
      outcome = { ok: false, reason, returnTo };
    }
  }
  broadcast(provider, outcome.ok);
  return outcome;
}

function broadcast(provider: IntegrationOAuthProvider, ok: boolean): void {
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage({ provider, ok });
    channel.close();
  } catch {
    // No BroadcastChannel: opener surfaces still re-check on window focus.
  }
}

/**
 * Run `onLinked` when `provider` finishes connecting in another window.
 * BroadcastChannel rather than `window.opener.postMessage` because the
 * provider's COOP headers sever the popup's opener reference.
 */
export function useIntegrationOAuthLinked(
  provider: IntegrationOAuthProvider | readonly IntegrationOAuthProvider[],
  onLinked: () => void,
  enabled = true,
): void {
  // Stable dep for an inline array of providers.
  const providersKey = typeof provider === "string" ? provider : provider.join(",");
  const onLinkedRef = useRef(onLinked);
  onLinkedRef.current = onLinked;
  useEffect(() => {
    if (!enabled || typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = (event: MessageEvent<{ provider?: string; ok?: boolean }>) => {
      const linked = event.data?.provider;
      if (linked && event.data.ok && providersKey.split(",").includes(linked)) onLinkedRef.current();
    };
    return () => channel.close();
  }, [providersKey, enabled]);
}
