/**
 * OAuth + access-token-refresh for Gmail and Outlook mailbox connections.
 *
 * Mirrors the existing sign-in OAuth pattern (HMAC-signed state, code
 * exchange) but writes to `external_email_accounts` with encrypted
 * refresh tokens — these tokens are NOT for sign-in, they exist solely
 * to read mailbox content for the unified inbox.
 *
 * Access tokens are short-lived (Gmail ~1h, Outlook ~1h) and never
 * persisted — `refreshAccessToken()` re-mints them on each sync run.
 */

import { decryptToken, encryptToken } from "./encryption.js";

export type EmailProviderId = "gmail" | "outlook";

interface ProviderCfg {
  authUrl: string;
  tokenUrl: string;
  scopes: string[];
  clientId: () => string;
  clientSecret: () => string;
  /** Pulled out of the token response or the user-info call, whichever
   *  is cheaper. */
  fetchAccountEmail: (accessToken: string) => Promise<string>;
  /** Extra params on the auth-redirect URL (Google needs offline access +
   *  consent prompt to guarantee a refresh token; Microsoft is happy
   *  with `offline_access` in scopes). */
  authParams: Record<string, string>;
}

function getEnv(key: string): string {
  return process.env[key] || (globalThis as any).__ENV?.[key] || "";
}

async function fetchGmailEmail(accessToken: string): Promise<string> {
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Gmail profile fetch failed: ${res.status}`);
  const j = await res.json() as { emailAddress: string };
  return j.emailAddress.toLowerCase();
}

async function fetchOutlookEmail(accessToken: string): Promise<string> {
  const res = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Graph /me fetch failed: ${res.status}`);
  const j = await res.json() as { mail?: string; userPrincipalName?: string };
  const addr = (j.mail ?? j.userPrincipalName ?? "").toLowerCase();
  if (!addr) throw new Error("No mailbox address on Graph profile");
  return addr;
}

export const EMAIL_PROVIDER_CONFIG: Record<EmailProviderId, ProviderCfg> = {
  gmail: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
    clientId: () => getEnv("GOOGLE_CLIENT_ID"),
    clientSecret: () => getEnv("GOOGLE_CLIENT_SECRET"),
    fetchAccountEmail: fetchGmailEmail,
    authParams: { access_type: "offline", prompt: "consent", include_granted_scopes: "true" },
  },
  outlook: {
    authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scopes: ["offline_access", "Mail.Read", "User.Read"],
    clientId: () => getEnv("MICROSOFT_CLIENT_ID"),
    clientSecret: () => getEnv("MICROSOFT_CLIENT_SECRET"),
    fetchAccountEmail: fetchOutlookEmail,
    authParams: { prompt: "select_account" },
  },
};

interface StatePayload { userId: string; ts: number; nonce: string; redirect: string }

function getJwtSecret(): string { return getEnv("JWT_SECRET"); }

export async function createState(payload: StatePayload): Promise<string> {
  const secret = getJwtSecret();
  const json = JSON.stringify(payload);
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(json));
  const sigHex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return btoa(json + "|" + sigHex);
}

export async function verifyState(state: string): Promise<StatePayload | null> {
  try {
    const decoded = atob(state);
    const sepIdx = decoded.lastIndexOf("|");
    const json = decoded.slice(0, sepIdx);
    const sigHex = decoded.slice(sepIdx + 1);
    const secret = getJwtSecret();
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" }, false, ["verify"],
    );
    const sigBytes = new Uint8Array(sigHex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
    const valid = await crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(json));
    if (!valid) return null;
    const payload = JSON.parse(json) as StatePayload;
    if (Date.now() - payload.ts > 10 * 60 * 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

interface TokenResp { access_token: string; refresh_token?: string; expires_in?: number; scope?: string }

export async function exchangeCode(
  provider: EmailProviderId,
  code: string,
  redirectUri: string,
): Promise<TokenResp> {
  const cfg = EMAIL_PROVIDER_CONFIG[provider];
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
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: params.toString(),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${provider} token exchange failed: ${res.status} ${body.slice(0, 600)}`);
  }
  return res.json() as Promise<TokenResp>;
}

/** Refresh path used by the sync worker on every run. We never persist
 *  access tokens — the encrypted refresh token is the source of truth. */
export async function refreshAccessToken(
  provider: EmailProviderId,
  encryptedRefreshToken: string,
): Promise<{ accessToken: string; expiresIn: number }> {
  const cfg = EMAIL_PROVIDER_CONFIG[provider];
  const refreshToken = await decryptToken(encryptedRefreshToken);
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: cfg.clientId(),
    client_secret: cfg.clientSecret(),
  });
  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: params.toString(),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${provider} token refresh failed: ${res.status} ${body.slice(0, 400)}`);
  }
  const j = await res.json() as TokenResp;
  return { accessToken: j.access_token, expiresIn: j.expires_in ?? 3600 };
}

export { encryptToken };
