/**
 * Config-driven OAuth runner for the social connection layer. One
 * authorization-code implementation drives every platform off
 * platform-config.ts — buildAuthUrl / exchangeCode / refresh — with the
 * per-platform quirks (client_key param, PKCE, scope-per-lane) expressed
 * as config, not branches.
 *
 * State is a signed HMAC blob (same technique as routes/oauth.ts) carrying
 * the platform, lane, owner, redirect, and — for PKCE platforms — the code
 * verifier. Cloudflare Workers are stateless, so the verifier can't live in
 * a session; it rides the signed state and is validated on callback.
 */

import type { SocialLane, SocialPlatform } from "../../../../shared/social-platforms.js";
import { getJwtSecret } from "../../utils/jwt.js";
import { apiBaseUrl } from "../../utils/public-urls.js";
import {
  hexToBytes,
  hmacSha256Hex,
  hmacSha256Verify,
  randomBase64Url,
  sha256Base64Url,
} from "../../utils/crypto.js";
import {
  socialPlatformConfig,
  type SocialIdentity,
  type SocialOAuthTokens,
} from "./platform-config.js";


/** The callback the platform redirects to. One fixed URL per scope (NOT per
 *  platform) so only two redirect URIs need registering in each developer
 *  console; the platform + lane ride the signed `state`. The self flow and
 *  the managed (SuperAdmin/brand) flow use distinct paths so the callback
 *  handler knows which store to write. */
export function socialCallbackUrl(scope: "self" | "managed"): string {
  return scope === "managed"
    ? `${apiBaseUrl()}/api/admin/social/oauth/callback`
    : `${apiBaseUrl()}/api/social/oauth/callback`;
}

// ─── Signed state ────────────────────────────────────────────────────────────

export interface SocialOAuthState {
  platform: SocialPlatform;
  lane: SocialLane;
  /** "self" → user connection; "managed" → brand account. */
  scope: "self" | "managed";
  /** The acting user (the connecting user, or the SuperAdmin for managed). */
  userId: string;
  /** Workspace company for self connections (null = personal). */
  companyId: string | null;
  redirectTo: string;
  /** PKCE code verifier (only for pkce platforms). */
  codeVerifier?: string;
  ts: number;
  nonce: string;
}

// getJwtSecret() throws when unconfigured instead of handing importKey a
// zero-length key (which surfaced as an opaque HMAC DataError 500).

async function signState(state: SocialOAuthState): Promise<string> {
  const payload = JSON.stringify(state);
  const sigHex = await hmacSha256Hex(getJwtSecret(), payload);
  return btoa(unescape(encodeURIComponent(payload)) + "|" + sigHex);
}

export async function verifyState(raw: string): Promise<SocialOAuthState | null> {
  try {
    const decoded = decodeURIComponent(escape(atob(raw)));
    const sep = decoded.lastIndexOf("|");
    const payload = decoded.slice(0, sep);
    const sigHex = decoded.slice(sep + 1);
    const ok = await hmacSha256Verify(getJwtSecret(), payload, hexToBytes(sigHex));
    if (!ok) return null;
    const st = JSON.parse(payload) as SocialOAuthState;
    if (Date.now() - st.ts > 10 * 60 * 1000) return null; // 10-min TTL
    return st;
  } catch {
    return null;
  }
}

// ─── PKCE ────────────────────────────────────────────────────────────────────

function randomVerifier(): string {
  return randomBase64Url(48);
}

/** S256 code challenge: unpadded base64url SHA-256 of the verifier. */
function challengeFor(verifier: string): Promise<string> {
  return sha256Base64Url(verifier);
}

// ─── Build authorize URL ─────────────────────────────────────────────────────

export interface BuildAuthArgs {
  platform: SocialPlatform;
  lane: SocialLane;
  scope: "self" | "managed";
  userId: string;
  companyId: string | null;
  redirectTo: string;
}

export async function buildSocialAuthUrl(args: BuildAuthArgs): Promise<string> {
  const cfg = socialPlatformConfig(args.platform);
  const scopes = cfg.scopesByLane[args.lane];

  const state: SocialOAuthState = {
    platform: args.platform,
    lane: args.lane,
    scope: args.scope,
    userId: args.userId,
    companyId: args.companyId,
    redirectTo: args.redirectTo,
    ts: Date.now(),
    nonce: randomBase64Url(12),
  };

  const params = new URLSearchParams({
    [cfg.clientIdParam]: cfg.clientId(),
    redirect_uri: socialCallbackUrl(args.scope),
    response_type: "code",
    scope: scopes.join(" "),
  });

  if (cfg.pkce) {
    const verifier = randomVerifier();
    state.codeVerifier = verifier;
    params.set("code_challenge", await challengeFor(verifier));
    params.set("code_challenge_method", "S256");
  }
  if (cfg.extraAuthParams) {
    for (const [k, v] of Object.entries(cfg.extraAuthParams)) params.set(k, v);
  }

  // state must be set AFTER the verifier is stashed into it.
  params.set("state", await signState(state));

  return `${cfg.authUrl}?${params.toString()}`;
}

// ─── Exchange code for tokens ────────────────────────────────────────────────

export async function exchangeSocialCode(
  state: SocialOAuthState,
  code: string,
): Promise<SocialOAuthTokens> {
  const cfg = socialPlatformConfig(state.platform);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: socialCallbackUrl(state.scope),
    [cfg.clientIdParam]: cfg.clientId(),
    client_secret: cfg.clientSecret(),
  });
  if (cfg.pkce && state.codeVerifier) body.set("code_verifier", state.codeVerifier);

  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "User-Agent": "hired.video",
    },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`token exchange failed: ${res.status} ${text.slice(0, 400)}`);
  }
  const d = (await res.json()) as any;
  return {
    accessToken: d.access_token,
    refreshToken: d.refresh_token,
    expiresInSec: typeof d.expires_in === "number" ? d.expires_in : undefined,
    scopes: typeof d.scope === "string" ? d.scope : cfg.scopesByLane[state.lane].join(" "),
  };
}

/** Refresh an access token. Returns null if the platform issued no refresh
 *  token (caller treats the connection as needing re-auth). */
export async function refreshSocialToken(
  platform: SocialPlatform,
  refreshToken: string,
): Promise<SocialOAuthTokens | null> {
  const cfg = socialPlatformConfig(platform);
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    [cfg.clientIdParam]: cfg.clientId(),
    client_secret: cfg.clientSecret(),
  });
  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "User-Agent": "hired.video",
    },
    body: body.toString(),
  });
  if (!res.ok) return null;
  const d = (await res.json()) as any;
  if (!d.access_token) return null;
  return {
    accessToken: d.access_token,
    // Some providers rotate the refresh token; keep the new one if present.
    refreshToken: d.refresh_token ?? refreshToken,
    expiresInSec: typeof d.expires_in === "number" ? d.expires_in : undefined,
    scopes: typeof d.scope === "string" ? d.scope : undefined,
  };
}

export async function fetchSocialIdentity(
  platform: SocialPlatform,
  accessToken: string,
): Promise<SocialIdentity> {
  return socialPlatformConfig(platform).fetchIdentity(accessToken);
}
