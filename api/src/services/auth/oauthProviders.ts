/**
 * OAuth sign-in provider registry (Google / LinkedIn / GitHub / Microsoft)
 * and the provider HTTP calls: authorization-code exchange + userinfo.
 */

import { getEnv } from "../../utils/env.js";

export interface OAuthProviderUser {
  id: string;
  email: string;
  name: string;
  avatar?: string;
}

export interface OAuthTokens {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

export interface ProviderCfg {
  authUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scopes: string[];
  clientId: () => string;
  clientSecret: () => string;
  parseUser: (d: any) => OAuthProviderUser;
  extraAuthParams?: Record<string, string>;
}

// GitHub rejects API requests without a User-Agent ("Request forbidden by
// administrative rules"), and Cloudflare Workers' fetch does not set one by
// default. Sent on every provider call — harmless for Google/LinkedIn/MS.
const OAUTH_USER_AGENT = "hired.video";

const PROVIDERS: Record<string, ProviderCfg> = {
  google: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userInfoUrl: "https://www.googleapis.com/oauth2/v3/userinfo",
    scopes: ["openid", "email", "profile"],
    clientId: () => getEnv("GOOGLE_CLIENT_ID"),
    clientSecret: () => getEnv("GOOGLE_CLIENT_SECRET"),
    extraAuthParams: { access_type: "offline", prompt: "select_account" },
    parseUser: (d) => ({ id: d.sub, email: d.email, name: d.name ?? d.email, avatar: d.picture }),
  },
  linkedin: {
    authUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    userInfoUrl: "https://api.linkedin.com/v2/userinfo",
    scopes: ["openid", "profile", "email"],
    clientId: () => getEnv("LINKEDIN_CLIENT_ID"),
    clientSecret: () => getEnv("LINKEDIN_CLIENT_SECRET"),
    parseUser: (d) => ({
      id: d.sub,
      email: d.email,
      name: d.name ?? (`${d.given_name ?? ""} ${d.family_name ?? ""}`.trim() || d.email),
      avatar: d.picture,
    }),
  },
  github: {
    authUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    userInfoUrl: "https://api.github.com/user",
    scopes: ["read:user", "user:email"],
    clientId: () => getEnv("GITHUB_CLIENT_ID"),
    clientSecret: () => getEnv("GITHUB_CLIENT_SECRET"),
    parseUser: (d) => ({ id: String(d.id), email: d.email ?? "", name: d.name ?? d.login ?? d.email, avatar: d.avatar_url }),
  },
  microsoft: {
    authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    userInfoUrl: "https://graph.microsoft.com/v1.0/me",
    // offline_access requests a refresh token (#390) so post-expiry Graph
    // calls (calendar sync, profile re-fetch) don't have to re-prompt.
    scopes: ["openid", "profile", "email", "User.Read", "offline_access"],
    clientId: () => getEnv("MICROSOFT_CLIENT_ID"),
    clientSecret: () => getEnv("MICROSOFT_CLIENT_SECRET"),
    parseUser: (d) => ({ id: d.id, email: d.mail ?? d.userPrincipalName ?? "", name: d.displayName ?? d.mail }),
  },
};

export function getOAuthProvider(name: string): ProviderCfg | undefined {
  return Object.prototype.hasOwnProperty.call(PROVIDERS, name) ? PROVIDERS[name] : undefined;
}

export async function exchangeCode(cfg: ProviderCfg, code: string, redirectUri: string): Promise<OAuthTokens> {
  // Microsoft's v2.0 token endpoint documents `scope` as Required on the token
  // request; Google/LinkedIn/GitHub treat it as optional, so passing it is safe
  // for all providers. Without it, Microsoft fails the exchange with
  // invalid_request and the callback redirects to /login?error=auth_failed.
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: cfg.clientId(),
    client_secret: cfg.clientSecret(),
    scope: cfg.scopes.join(" "),
  });
  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "User-Agent": OAUTH_USER_AGENT,
    },
    body: params.toString(),
  });
  if (!res.ok) {
    // Capture the provider's error_description so Cloudflare logs show why
    // (e.g. Microsoft's "AADSTS50011: redirect URI mismatch" or
    // "AADSTS65001: user/admin has not consented") instead of just a status.
    const body = await res.text().catch(() => "");
    throw new Error(`Token exchange failed: ${res.status} ${body.slice(0, 600)}`);
  }
  return res.json() as Promise<OAuthTokens>;
}

export async function fetchUserInfo(cfg: ProviderCfg, accessToken: string): Promise<unknown> {
  const res = await fetch(cfg.userInfoUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "User-Agent": OAUTH_USER_AGENT,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`UserInfo fetch failed: ${res.status} ${body.slice(0, 600)}`);
  }
  return res.json();
}

export async function getGitHubEmail(accessToken: string): Promise<string> {
  try {
    const res = await fetch("https://api.github.com/user/emails", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "User-Agent": OAUTH_USER_AGENT,
      },
    });
    if (!res.ok) return "";
    const emails = await res.json() as Array<{ email: string; primary: boolean; verified: boolean }>;
    return emails.find((e) => e.primary && e.verified)?.email ?? emails[0]?.email ?? "";
  } catch {
    return "";
  }
}
