/**
 * Generic OAuth 2.0 provider primitives.
 *
 * Standard `authorization_code` + `refresh_token` flows over a config
 * object. Concrete provider modules (`googleOAuth2.ts` for now; future:
 * LinkedIn / TikTok / X) supply their endpoint URLs + scope list and
 * compose these functions — they don't reimplement the protocol.
 *
 * Open/Closed: new OAuth providers add a new config and are done. No
 * change to this file required.
 *
 * Pure HTTP. No DB, no Hono. Persistence + DI seams live one layer up
 * (e.g. `services/youtube/youtubeOAuth.ts.getFreshAccessToken`).
 */

export interface OAuth2ProviderConfig {
  /** Stable identifier used for error messages + logging. */
  readonly name: string;
  readonly clientId: string | undefined;
  readonly clientSecret: string | undefined;
  /** OAuth 2.0 consent / authorization endpoint. */
  readonly authEndpoint: string;
  /** OAuth 2.0 token endpoint (used for both code-exchange and refresh). */
  readonly tokenEndpoint: string;
  /** Space-separated scope string for the consent URL. */
  readonly scopes: string;
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
  scopes: string;
}

export type OAuth2ErrorReason =
  | "NOT_CONFIGURED"
  | "TOKEN_REQUEST_FAILED";

export class OAuth2Error extends Error {
  constructor(public readonly reason: OAuth2ErrorReason, message: string) {
    super(message);
    this.name = "OAuth2Error";
  }
}

/** Optional extra params (eg. Google's `access_type=offline`) appended to the auth URL. */
export interface BuildAuthUrlOptions {
  redirectUri: string;
  extraParams?: Record<string, string>;
}

/** Build the user-facing consent URL for `config`. */
export function buildAuthUrl(config: OAuth2ProviderConfig, opts: BuildAuthUrlOptions): string {
  if (!config.clientId) {
    throw new OAuth2Error("NOT_CONFIGURED", `${config.name} clientId is not configured`);
  }
  const params = new URLSearchParams({
    client_id:     config.clientId,
    redirect_uri:  opts.redirectUri,
    response_type: "code",
    scope:         config.scopes,
    ...(opts.extraParams ?? {}),
  });
  return `${config.authEndpoint}?${params.toString()}`;
}

interface RawTokenResponse {
  access_token: string;
  refresh_token?: string | null;
  expires_in: number;
  scope?: string;
}

/** Convert provider's `expires_in` (seconds) to an absolute Date with a
 *  30-second safety buffer. Exported so token-aware callers can compose. */
export function expiresInToDate(expiresInSeconds: number, now: number = Date.now()): Date {
  return new Date(now + (expiresInSeconds - 30) * 1000);
}

/** Required scopes the user did NOT grant. Providers with granular consent
 *  (Google lists each scope as an unchecked box) can return a token for a
 *  subset of what was requested, so callers must check before persisting.
 *  `granted` is the token response's `scope` — space- or comma-separated. */
export function missingScopes(granted: string, required: readonly string[]): string[] {
  const have = new Set(granted.split(/[\s,]+/).filter(Boolean));
  return required.filter((s) => !have.has(s));
}

function toTokenSet(raw: RawTokenResponse): TokenSet {
  return {
    accessToken:  raw.access_token,
    refreshToken: raw.refresh_token ?? null,
    expiresAt:    expiresInToDate(raw.expires_in),
    scopes:       raw.scope ?? "",
  };
}

async function tokenRequest(config: OAuth2ProviderConfig, params: Record<string, string>): Promise<TokenSet> {
  if (!config.clientId || !config.clientSecret) {
    throw new OAuth2Error("NOT_CONFIGURED", `${config.name} client credentials are not configured`);
  }
  const res = await fetch(config.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      ...params,
      client_id:     config.clientId,
      client_secret: config.clientSecret,
    }).toString(),
  });
  if (!res.ok) {
    throw new OAuth2Error(
      "TOKEN_REQUEST_FAILED",
      `${config.name} /token rejected: ${res.status} ${await res.text()}`,
    );
  }
  return toTokenSet(await res.json() as RawTokenResponse);
}

/** Exchange a one-time `code` from the consent redirect for a token set. */
export function exchangeAuthCode(
  config: OAuth2ProviderConfig,
  code: string,
  redirectUri: string,
): Promise<TokenSet> {
  return tokenRequest(config, {
    code,
    redirect_uri: redirectUri,
    grant_type:   "authorization_code",
  });
}

/** Trade a stored refresh token for a fresh access token. */
export function refreshAccessToken(
  config: OAuth2ProviderConfig,
  refreshToken: string,
): Promise<TokenSet> {
  return tokenRequest(config, {
    refresh_token: refreshToken,
    grant_type:    "refresh_token",
  });
}
