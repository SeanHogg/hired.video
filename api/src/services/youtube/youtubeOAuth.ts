/**
 * YouTube-specific OAuth glue. Composes the generic `oauth2Provider`
 * primitives for the standard auth-code / refresh flows, adds the
 * YouTube-specific channel lookup, and owns the lazy access-token
 * refresh that persists the rotation through the account repository.
 *
 * The route handler / use case never reaches into `oauth2Provider`
 * directly — it goes through this module so YouTube-specific scope
 * lists, error-mapping, and channel metadata stay in one place.
 */

import {
  buildAuthUrl as buildAuthUrlGeneric,
  exchangeAuthCode as exchangeAuthCodeGeneric,
  refreshAccessToken as refreshAccessTokenGeneric,
  expiresInToDate,
  missingScopes,
  OAuth2Error,
  type TokenSet,
} from "../oauth/oauth2Provider.js";
import {
  googleOAuth2Config,
  GOOGLE_OFFLINE_AUTH_PARAMS,
  fetchGoogleUserInfo,
} from "../oauth/googleOAuth2.js";
import type { YouTubeAccount, RotateTokenInput } from "./youtubeAccountRepository.js";
import { rotateAccessToken as defaultRotateAccessToken } from "./youtubeAccountRepository.js";

/** Scopes a YouTube connection is useless without — `youtube.upload` to
 *  insert videos, `youtube.readonly` so `/channels?mine=true` returns the
 *  channel and view counts can be read. Google's granular consent shows each
 *  as an unchecked box, so a callback must reject a token missing either. */
export const YOUTUBE_REQUIRED_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
] as const;

/** Consent-URL scope set: the required pair plus `userinfo.email` for the
 *  connecting user's identity. */
export const YOUTUBE_SCOPES = [
  ...YOUTUBE_REQUIRED_SCOPES,
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

/** True when the granted scope string covers every required YouTube scope. */
export function hasRequiredYouTubeScopes(granted: string): boolean {
  return missingScopes(granted, YOUTUBE_REQUIRED_SCOPES).length === 0;
}

const CHANNELS_ENDPOINT = "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true";

/** Safety window — never serve a token that's about to expire mid-request. */
export const ACCESS_TOKEN_SAFETY_WINDOW_MS = 60_000;

/** Re-export so downstream tests can pin time independently. */
export { expiresInToDate };

/**
 * The minimum Cloudflare Worker bindings this module needs. Every
 * exported function takes `YouTubeOAuthConfig` instead of the full
 * `Env` (interface segregation). The route layer is the only place
 * that sees the full `Env` and projects to this shape via
 * `youtubeOAuthConfig(env)`.
 */
export interface YouTubeOAuthConfig {
  clientId: string | undefined;
  clientSecret: string | undefined;
}

/** Project a full Cloudflare `Env` down to the OAuth subset. YouTube uses
 *  the same Google OAuth client as Google sign-in (one consent screen, one
 *  credential to rotate); that client needs the YouTube Data API enabled. */
export function youtubeOAuthConfig(env: { GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string }): YouTubeOAuthConfig {
  return { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET };
}

/**
 * Pure decision helper exported for unit tests. Returns true when the
 * cached access token must be exchanged for a new one. Refreshes when
 * the token is missing, the expiry is missing/invalid/past, OR the
 * expiry falls inside the safety window.
 */
export function shouldRefreshAccessToken(
  account: { accessToken?: string | null; tokenExpiresAt?: Date | string | null },
  now: number = Date.now(),
): boolean {
  if (!account.accessToken) return true;
  if (!account.tokenExpiresAt) return true;
  const expiresAt = new Date(account.tokenExpiresAt).getTime();
  if (Number.isNaN(expiresAt)) return true;
  return expiresAt <= now + ACCESS_TOKEN_SAFETY_WINDOW_MS;
}

/** Backwards-compatible YouTube-specific error. Wraps the generic
 *  `OAuth2Error` so the route layer can keep its existing error-kind
 *  pattern-matching unchanged. */
export class YouTubeAuthError extends Error {
  constructor(
    public readonly reason: "REFRESH_TOKEN_MISSING" | "YOUTUBE_NOT_CONFIGURED" | "REFRESH_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "YouTubeAuthError";
  }
}

/** Translate an `OAuth2Error` from the generic provider into the
 *  YouTube-flavored subtype the route layer maps to HTTP codes. */
function wrapOAuth2Error(err: unknown): YouTubeAuthError {
  if (err instanceof OAuth2Error) {
    if (err.reason === "NOT_CONFIGURED") {
      return new YouTubeAuthError("YOUTUBE_NOT_CONFIGURED", err.message);
    }
    return new YouTubeAuthError("REFRESH_FAILED", err.message);
  }
  if (err instanceof Error) return new YouTubeAuthError("REFRESH_FAILED", err.message);
  return new YouTubeAuthError("REFRESH_FAILED", String(err));
}

function asProvider(config: YouTubeOAuthConfig) {
  return googleOAuth2Config({
    name:         "YouTube",
    clientId:     config.clientId,
    clientSecret: config.clientSecret,
    scopes:       YOUTUBE_SCOPES,
  });
}

/** Build the user-facing consent URL. */
export function buildAuthUrl(config: YouTubeOAuthConfig, redirectUri: string): string {
  return buildAuthUrlGeneric(asProvider(config), {
    redirectUri,
    extraParams: GOOGLE_OFFLINE_AUTH_PARAMS,
  });
}

/** Exchange an authorization code for an access + refresh token pair.
 *  Result keys mirror the legacy raw Google response (`access_token`,
 *  `refresh_token`, `expires_in`, `scope`) so existing route-layer
 *  callers don't need to be rewritten in this round. */
export async function exchangeAuthCode(
  config: YouTubeOAuthConfig,
  code: string,
  redirectUri: string,
): Promise<{ access_token: string; refresh_token?: string; expires_in: number; scope: string }> {
  let tokens: TokenSet;
  try {
    tokens = await exchangeAuthCodeGeneric(asProvider(config), code, redirectUri);
  } catch (err) {
    throw wrapOAuth2Error(err);
  }
  // Rebuild the legacy `expires_in` representation (route-layer needs to
  // call `expiresInToDate` itself for the persisted timestamp).
  const expiresIn = Math.max(0, Math.floor((tokens.expiresAt.getTime() - Date.now()) / 1000) + 30);
  return {
    access_token:  tokens.accessToken,
    refresh_token: tokens.refreshToken ?? undefined,
    expires_in:    expiresIn,
    scope:         tokens.scopes,
  };
}

/** Identity helpers — re-exports so the route layer doesn't have to
 *  import from the generic `oauth/` namespace. */
export const fetchUserInfo = fetchGoogleUserInfo;

/** Fetch the connecting user's primary YouTube channel (id + title).
 *  YouTube-specific — no equivalent in the generic OAuth2 protocol. */
export async function fetchPrimaryChannel(accessToken: string): Promise<{ id: string; title: string } | null> {
  const res = await fetch(CHANNELS_ENDPOINT, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return null;
  const data = await res.json() as { items?: Array<{ id: string; snippet: { title: string } }> };
  const first = data.items?.[0];
  if (!first) return null;
  return { id: first.id, title: first.snippet.title };
}

/** Persistence seam — accept any function with this shape so callers can
 *  inject a fake (tests) without monkey-patching the import. */
export type RotateAccessTokenFn = (
  accountId: string,
  rotation: RotateTokenInput,
) => Promise<void>;

/**
 * Get an access token guaranteed to be valid for at least
 * `ACCESS_TOKEN_SAFETY_WINDOW_MS`. Refreshes via Google + persists the
 * rotation through the supplied `rotate` function when needed. Throws
 * `YouTubeAuthError` when the refresh path is unavailable so the route
 * handler can return a 401 "reconnect your account" response.
 *
 * `rotate` defaults to the production repository write so existing
 * callers don't have to thread it through; tests override it.
 */
export async function getFreshAccessToken(
  config: YouTubeOAuthConfig,
  account: YouTubeAccount,
  rotate: RotateAccessTokenFn = defaultRotateAccessToken,
): Promise<string> {
  if (!shouldRefreshAccessToken(account)) {
    return account.accessToken;
  }
  if (!account.refreshToken) {
    throw new YouTubeAuthError("REFRESH_TOKEN_MISSING", "Refresh token missing");
  }

  let tokens: TokenSet;
  try {
    tokens = await refreshAccessTokenGeneric(asProvider(config), account.refreshToken);
  } catch (err) {
    throw wrapOAuth2Error(err);
  }

  await rotate(account.id, { accessToken: tokens.accessToken, tokenExpiresAt: tokens.expiresAt });
  return tokens.accessToken;
}
