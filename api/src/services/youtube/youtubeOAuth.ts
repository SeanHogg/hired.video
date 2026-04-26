/**
 * Google OAuth integration for the YouTube Pro publish flow (#202).
 *
 * Pure HTTP / Google API calls. Persistence is delegated to the
 * `youtubeAccountRepository` and `tokenExpiresAt` decisions to the pure
 * `shouldRefreshAccessToken` predicate (also exported here so the route
 * file stays thin). No DB writes happen inside this module — callers
 * must persist the rotated token via the repository.
 */

import type { Env } from "../../types/index.js";
import type { YouTubeAccount } from "./youtubeAccountRepository.js";
import { rotateAccessToken } from "./youtubeAccountRepository.js";

// `youtube.upload` is enough to insert videos; `youtube.readonly` lets
// `/channels?mine=true` return the connecting user's channel ID + title.
export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo";
const CHANNELS_ENDPOINT = "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true";
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";

/** Safety window — never serve a token that's about to expire mid-request. */
export const ACCESS_TOKEN_SAFETY_WINDOW_MS = 60_000;

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

export class YouTubeAuthError extends Error {
  constructor(public readonly reason: "REFRESH_TOKEN_MISSING" | "YOUTUBE_NOT_CONFIGURED" | "REFRESH_FAILED", message: string) {
    super(message);
    this.name = "YouTubeAuthError";
  }
}

/** Build the user-facing consent URL. */
export function buildAuthUrl(env: Env, redirectUri: string): string {
  if (!env.YOUTUBE_CLIENT_ID) throw new Error("YOUTUBE_CLIENT_ID is not configured");
  const params = new URLSearchParams({
    client_id:               env.YOUTUBE_CLIENT_ID,
    redirect_uri:            redirectUri,
    response_type:           "code",
    scope:                   YOUTUBE_SCOPES,
    access_type:             "offline",
    include_granted_scopes:  "true",
    prompt:                  "consent",
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
}

/** Exchange an authorization code for an access + refresh token pair. */
export async function exchangeAuthCode(
  env: Env,
  code: string,
  redirectUri: string,
): Promise<TokenResponse> {
  if (!env.YOUTUBE_CLIENT_ID || !env.YOUTUBE_CLIENT_SECRET) {
    throw new YouTubeAuthError("YOUTUBE_NOT_CONFIGURED", "YouTube integration not configured");
  }

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id:     env.YOUTUBE_CLIENT_ID,
      client_secret: env.YOUTUBE_CLIENT_SECRET,
      redirect_uri:  redirectUri,
      grant_type:    "authorization_code",
    }).toString(),
  });
  if (!res.ok) {
    throw new YouTubeAuthError("REFRESH_FAILED", `Google rejected the OAuth code: ${await res.text()}`);
  }
  return await res.json() as TokenResponse;
}

/** Fetch the connecting user's identity (sub + email + name). */
export async function fetchUserInfo(accessToken: string): Promise<{ sub: string; email?: string; name?: string }> {
  const res = await fetch(USERINFO_ENDPOINT, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return { sub: "unknown" };
  return await res.json() as { sub: string; email?: string; name?: string };
}

/** Fetch the connecting user's primary YouTube channel (id + title). */
export async function fetchPrimaryChannel(accessToken: string): Promise<{ id: string; title: string } | null> {
  const res = await fetch(CHANNELS_ENDPOINT, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return null;
  const data = await res.json() as { items?: Array<{ id: string; snippet: { title: string } }> };
  const first = data.items?.[0];
  if (!first) return null;
  return { id: first.id, title: first.snippet.title };
}

/**
 * Get an access token guaranteed to be valid for at least
 * `ACCESS_TOKEN_SAFETY_WINDOW_MS`. Refreshes via Google + persists the
 * rotation through the repository when needed. Throws `YouTubeAuthError`
 * when the refresh path is unavailable so the route handler can return a
 * 401 "reconnect your account" response.
 */
export async function getFreshAccessToken(env: Env, account: YouTubeAccount): Promise<string> {
  if (!shouldRefreshAccessToken(account)) {
    return account.accessToken;
  }

  if (!account.refreshToken) {
    throw new YouTubeAuthError("REFRESH_TOKEN_MISSING", "Refresh token missing");
  }
  if (!env.YOUTUBE_CLIENT_ID || !env.YOUTUBE_CLIENT_SECRET) {
    throw new YouTubeAuthError("YOUTUBE_NOT_CONFIGURED", "YouTube integration not configured");
  }

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id:     env.YOUTUBE_CLIENT_ID,
      client_secret: env.YOUTUBE_CLIENT_SECRET,
      refresh_token: account.refreshToken,
      grant_type:    "refresh_token",
    }).toString(),
  });
  if (!res.ok) {
    throw new YouTubeAuthError("REFRESH_FAILED", `Refresh failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json() as { access_token: string; expires_in: number };
  const tokenExpiresAt = new Date(Date.now() + (data.expires_in - 30) * 1000);

  await rotateAccessToken(account.id, { accessToken: data.access_token, tokenExpiresAt });
  return data.access_token;
}

/** Convenience wrapper: convert Google's `expires_in` (seconds) into an
 *  absolute timestamp with a 30-second safety buffer. Exported for tests. */
export function expiresInToDate(expiresInSeconds: number, now: number = Date.now()): Date {
  return new Date(now + (expiresInSeconds - 30) * 1000);
}
