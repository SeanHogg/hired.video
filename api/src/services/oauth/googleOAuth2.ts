/**
 * Google OAuth 2.0 provider config + the small set of Google-specific
 * userinfo / API helpers that don't fit the generic OAuth2 protocol.
 *
 * Composes `oauth2Provider.ts` for the protocol bits (auth URL,
 * exchange, refresh). Adds:
 *   - `GOOGLE_USERINFO_ENDPOINT` accessor (`fetchGoogleUserInfo`)
 *   - The `access_type=offline` + `prompt=consent` URL parameters
 *     Google requires for refresh-token issuance.
 *
 * Per-feature scope sets (YouTube upload, Calendar read/write, Drive)
 * are owned by the feature module that uses them — this file holds
 * only the protocol endpoints + the userinfo helper.
 */

export const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
export const GOOGLE_USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo";

/** Extra URL params Google needs to issue a refresh token at consent.
 *  Pass to `oauth2Provider.buildAuthUrl({ redirectUri, extraParams })`. */
export const GOOGLE_OFFLINE_AUTH_PARAMS = {
  access_type:            "offline",
  include_granted_scopes: "true",
  prompt:                 "consent",
} as const;

/** Build a Google OAuth2 provider config bound to a specific scope set. */
export function googleOAuth2Config(input: {
  clientId: string | undefined;
  clientSecret: string | undefined;
  scopes: string;
  /** Display name used in error messages. */
  name?: string;
}) {
  return {
    name:          input.name ?? "Google",
    clientId:      input.clientId,
    clientSecret:  input.clientSecret,
    authEndpoint:  GOOGLE_AUTH_ENDPOINT,
    tokenEndpoint: GOOGLE_TOKEN_ENDPOINT,
    scopes:        input.scopes,
  } as const;
}

/** Fetch the connecting user's identity (sub + email + name). Returns
 *  a placeholder when the endpoint rejects so callers don't have to
 *  branch on transport errors for the userinfo step alone. */
export async function fetchGoogleUserInfo(accessToken: string): Promise<{ sub: string; email?: string; name?: string }> {
  const res = await fetch(GOOGLE_USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return { sub: "unknown" };
  return await res.json() as { sub: string; email?: string; name?: string };
}
