import { Hono } from "hono";
import { SignJWT, jwtVerify } from "jose";
import { and, eq } from "drizzle-orm";
import type { Variables, AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { sendMagicLinkEmail } from "../services/adapters/email.js";
import { recordReferralAttribution } from "../services/auth/attribution.js";
import { createAffiliateProfileForUser } from "../services/auth/affiliate.js";
import { seedOnboardingTasks } from "../lib/onboarding.js";
import { markUserLogin } from "./auth.js";
import { isPublicSignupRole } from "../../../shared/user-roles.js";
import {
  createSession,
  getActiveSessions,
  revokeSession,
  revokeAllSessionsForUser,
} from "../services/auth/sessions.js";

const { users, oauthAccounts, magicLinkTokens, sessions, loginEvents } = schema;

function extractClientIp(c: any): string | null {
  if (!c?.req?.header) return null;
  const cf = c.req.header("CF-Connecting-IP");
  if (cf) return cf.trim();
  const xff = c.req.header("X-Forwarded-For");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return null;
}

function extractUserAgent(c: any): string | null {
  if (!c?.req?.header) return null;
  const ua = c.req.header("User-Agent");
  return ua ? ua.slice(0, 1024) : null;
}

interface OAuthLoginEvent {
  userId: string | null;
  email: string | null;
  provider: string;
  kind: "register" | "oauth_login";
  success: boolean;
  failureReason?: string | null;
}

/** Write a login_events row for an OAuth attempt. Awaited so the row
 *  lands before redirect, but try/catched so a telemetry failure never
 *  breaks the auth flow. */
async function recordOAuthEvent(
  db: ReturnType<typeof getDb>,
  c: any,
  ev: OAuthLoginEvent,
): Promise<void> {
  try {
    await db.insert(loginEvents).values({
      userId: ev.userId,
      email: ev.email,
      kind: ev.kind,
      provider: ev.provider,
      ipAddress: extractClientIp(c),
      userAgent: extractUserAgent(c),
      success: ev.success,
      failureReason: ev.failureReason ?? null,
    } as any);
  } catch (err) {
    console.error("[oauth] login_event insert failed:", err);
  }
}

function getEnv(key: string): string {
  return process.env[key] || (globalThis as any).__ENV?.[key] || "";
}

function getJwtSecret(): string {
  return getEnv("JWT_SECRET");
}

function getFrontendBase(): string {
  const frontendUrl = getEnv("FRONTEND_URL");
  return frontendUrl.split(",")[0]?.trim() || "https://hired.video";
}

function getApiBase(): string {
  return getEnv("API_URL") || "https://api.hired.video";
}

async function createJwt(sub: string, email: string, role: string, emailVerified: boolean, sid?: string): Promise<string> {
  const secret = new TextEncoder().encode(getJwtSecret());
  const claims: Record<string, unknown> = { email, roles: [role], emailVerified, mustChangePassword: false };
  if (sid) claims.sid = sid;
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
}

/** Inbound attribution carried through the OAuth handshake so "Continue with
 *  Google" signups credit the affiliate + persist campaign UTMs the same way
 *  password signups do (gaps #1683). Signed inside the HMAC state, so it can't
 *  be tampered with between start and callback. */
interface OAuthAttribution {
  ref?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  landingReferrer?: string;
}

/** Strip empties + cap lengths so a tampered/oversized start URL can't bloat
 *  the signed state. Mirrors the 64/128-char ceilings used on the user row. */
function sanitizeAttribution(a: OAuthAttribution | undefined): OAuthAttribution | undefined {
  if (!a) return undefined;
  const clip = (v: string | undefined, n: number) => (v ? String(v).slice(0, n) : undefined);
  const out: OAuthAttribution = {
    ref: clip(a.ref, 64),
    utmSource: clip(a.utmSource, 128),
    utmMedium: clip(a.utmMedium, 128),
    utmCampaign: clip(a.utmCampaign, 128),
    utmTerm: clip(a.utmTerm, 128),
    utmContent: clip(a.utmContent, 128),
    landingReferrer: clip(a.landingReferrer, 512),
  };
  const hasAny = Object.values(out).some((v) => v);
  return hasAny ? out : undefined;
}

/** Signup intent forwarded by the affiliate / creator landing pages so a
 *  "Continue with Google" signup lands on the right role + auto-creates the
 *  affiliate profile — the OAuth analogue of the password register's
 *  `role` + `enableAffiliate` fields. Signed into the HMAC state so it can't
 *  be swapped between start and callback. Only consulted on NEW-user creation;
 *  an existing user logging in via OAuth keeps their stored role. */
interface SignupIntent {
  role?: string;
  enableAffiliate?: boolean;
}

/** Keep only a whitelisted role; drop anything else (incl. `employee`/`admin`)
 *  so a tampered start URL can't self-assign a privileged role. */
function sanitizeIntent(i: SignupIntent | undefined): SignupIntent | undefined {
  if (!i) return undefined;
  const role = isPublicSignupRole(i.role) ? i.role : undefined;
  const enableAffiliate = i.enableAffiliate === true ? true : undefined;
  if (!role && !enableAffiliate) return undefined;
  return { ...(role ? { role } : {}), ...(enableAffiliate ? { enableAffiliate } : {}) };
}

async function createOAuthState(redirect: string, linkUserId?: string, attribution?: OAuthAttribution, intent?: SignupIntent): Promise<string> {
  const secret = getJwtSecret();
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const attr = sanitizeAttribution(attribution);
  const intentClean = sanitizeIntent(intent);
  const payload = JSON.stringify({ nonce, redirect: redirect || "/dashboard", ts: Date.now(), ...(linkUserId ? { linkUserId } : {}), ...(attr ? { attr } : {}), ...(intentClean ? { intent: intentClean } : {}) });
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const sigHex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return btoa(payload + "|" + sigHex);
}

async function verifyOAuthState(state: string): Promise<{ redirect: string; linkUserId?: string; attr?: OAuthAttribution; intent?: SignupIntent } | null> {
  try {
    const secret = getJwtSecret();
    const decoded = atob(state);
    const sepIdx = decoded.lastIndexOf("|");
    const payload = decoded.slice(0, sepIdx);
    const sigHex = decoded.slice(sepIdx + 1);
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" }, false, ["verify"],
    );
    const sigBytes = new Uint8Array(sigHex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
    const valid = await crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(payload));
    if (!valid) return null;
    const { redirect, ts, linkUserId, attr, intent } = JSON.parse(payload);
    if (Date.now() - ts > 10 * 60 * 1000) return null;
    return { redirect: redirect || "/dashboard", linkUserId, attr, intent: sanitizeIntent(intent) };
  } catch {
    return null;
  }
}

interface ProviderCfg {
  authUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scopes: string[];
  clientId: () => string;
  clientSecret: () => string;
  parseUser: (d: any) => { id: string; email: string; name: string; avatar?: string };
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

async function exchangeCode(cfg: ProviderCfg, code: string, redirectUri: string) {
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
  return res.json() as Promise<{ access_token: string; refresh_token?: string; expires_in?: number }>;
}

async function fetchUserInfo(cfg: ProviderCfg, accessToken: string) {
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

async function getGitHubEmail(accessToken: string): Promise<string> {
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

export const oauthRoutes = new Hono<AppEnv>();

// ============================================================================
// OAuth provider routes
// ============================================================================

oauthRoutes.get("/:provider", async (c) => {
  const name = c.req.param("provider").toLowerCase();
  const cfg = PROVIDERS[name];
  if (!cfg) return c.json(error("NOT_FOUND", `Unknown provider: ${name}`), 404);
  if (!cfg.clientId()) return c.json(error("SERVICE_UNAVAILABLE", `${name} login not configured`), 503);

  const redirect = c.req.query("redirect") || "/dashboard";

  // If the user is already logged in (connecting from Settings), embed their userId in state
  // so the callback links to the existing account instead of doing email-based lookup.
  let linkUserId: string | undefined;
  const linkToken = c.req.query("link_token");
  if (linkToken) {
    try {
      const { payload } = await jwtVerify(linkToken, new TextEncoder().encode(getJwtSecret()), { algorithms: ["HS256"] });
      linkUserId = payload.sub as string;
    } catch { /* invalid token — treat as unauthenticated flow */ }
  }

  // Carry inbound attribution forwarded by the frontend OAuth button so
  // affiliate credit + campaign UTMs survive the handshake (gap #1683).
  const attribution: OAuthAttribution = {
    ref: c.req.query("ref") || undefined,
    utmSource: c.req.query("utm_source") || undefined,
    utmMedium: c.req.query("utm_medium") || undefined,
    utmCampaign: c.req.query("utm_campaign") || undefined,
    utmTerm: c.req.query("utm_term") || undefined,
    utmContent: c.req.query("utm_content") || undefined,
    landingReferrer: c.req.query("landing_referrer") || undefined,
  };

  // Signup intent forwarded by the affiliate / creator landing pages (or any
  // signup surface that passes ?role=). Validated + signed into the state so
  // a NEW account created through this handshake lands on the right role and
  // (for affiliates) gets its affiliate profile minted — parity with the
  // password register's role + enableAffiliate fields.
  const intent: SignupIntent = {
    role: c.req.query("role") || undefined,
    enableAffiliate: c.req.query("affiliate") === "1" || c.req.query("affiliate") === "true",
  };

  const state = await createOAuthState(redirect, linkUserId, attribution, intent);
  const callbackUrl = `${getApiBase()}/api/auth/oauth/${name}/callback`;

  const params = new URLSearchParams({
    client_id: cfg.clientId(),
    redirect_uri: callbackUrl,
    response_type: "code",
    scope: cfg.scopes.join(" "),
    state,
    ...cfg.extraAuthParams,
  });

  return c.redirect(`${cfg.authUrl}?${params.toString()}`);
});

oauthRoutes.get("/:provider/callback", async (c) => {
  const name = c.req.param("provider").toLowerCase();
  const cfg = PROVIDERS[name];
  const base = getFrontendBase();

  if (!cfg) return c.redirect(`${base}/login?error=unknown_provider`);

  const code = c.req.query("code");
  const state = c.req.query("state");
  const errParam = c.req.query("error");

  if (errParam) return c.redirect(`${base}/login?error=${encodeURIComponent(errParam)}`);
  if (!code || !state) return c.redirect(`${base}/login?error=missing_params`);

  const stateData = await verifyOAuthState(state);
  if (!stateData) return c.redirect(`${base}/login?error=invalid_state`);

  const callbackUrl = `${getApiBase()}/api/auth/oauth/${name}/callback`;

  let tokens: { access_token: string; refresh_token?: string; expires_in?: number };
  let providerUser: { id: string; email: string; name: string; avatar?: string };

  try {
    tokens = await exchangeCode(cfg, code, callbackUrl);
    const raw = await fetchUserInfo(cfg, tokens.access_token);
    providerUser = cfg.parseUser(raw);
    if (name === "github" && !providerUser.email) {
      providerUser.email = await getGitHubEmail(tokens.access_token);
    }
  } catch (err) {
    console.error(`[oauth:${name}] Failed:`, err);
    return c.redirect(`${base}/login?error=auth_failed`);
  }

  if (!providerUser.email && !stateData.linkUserId) return c.redirect(`${base}/login?error=no_email`);

  const db = getDb();
  const [existingOAuth] = await db
    .select()
    .from(oauthAccounts)
    .where(and(eq(oauthAccounts.provider, name), eq(oauthAccounts.providerAccountId, providerUser.id)))
    .limit(1);

  let userId: string;

  if (existingOAuth) {
    // Already linked — if this is a connect flow and it's on a different account,
    // re-link it to the current user (they just proved ownership of both via link_token + OAuth).
    userId = stateData.linkUserId ?? existingOAuth.userId;
    await db.update(oauthAccounts).set({
      userId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      tokenExpiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
      displayName: providerUser.name,
      avatarUrl: providerUser.avatar ?? null,
      updatedAt: new Date(),
    } as any).where(eq(oauthAccounts.id, existingOAuth.id));
  } else if (stateData.linkUserId) {
    // Linking a new provider to an existing logged-in user — skip email lookup entirely
    userId = stateData.linkUserId;
    await db.insert(oauthAccounts).values({
      userId,
      provider: name,
      providerAccountId: providerUser.id,
      email: providerUser.email?.toLowerCase() ?? null,
      displayName: providerUser.name,
      avatarUrl: providerUser.avatar ?? null,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      tokenExpiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
    } as any);
  } else {
    // New login flow — find or create user by email
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, providerUser.email!.toLowerCase())).limit(1);

    if (existing) {
      userId = existing.id;
    } else {
      const attr = stateData.attr;
      // Honour the signed signup intent so OAuth signups from the affiliate /
      // creator landing pages land on the right role (parity with password
      // register). Defaults to job_seeker for organic "Continue with X".
      const signupRole = stateData.intent?.role ?? "job_seeker";
      const [newUser] = await db.insert(users).values({
        email: providerUser.email!.toLowerCase(),
        name: providerUser.name,
        passwordHash: null,
        emailVerified: true,
        role: signupRole,
        // Creator signups land in channel-mode immediately so their /people
        // profile renders as a channel from day one (mirrors handleRegister).
        ...(signupRole === "creator" ? { profileMode: "channel" } : {}),
        // Pin the signup network attribution to the user row so spam
        // investigation works the same for password and OAuth signups.
        signupIp: extractClientIp(c),
        signupUserAgent: extractUserAgent(c),
        // Campaign attribution carried through the signed OAuth state so
        // OAuth signups populate the same UTM columns as password signups
        // (gap #1683). Null across the board for organic OAuth.
        utmSource: attr?.utmSource ?? null,
        utmMedium: attr?.utmMedium ?? null,
        utmCampaign: attr?.utmCampaign ?? null,
        utmTerm: attr?.utmTerm ?? null,
        utmContent: attr?.utmContent ?? null,
        landingReferrer: attr?.landingReferrer ?? null,
      } as any).returning({ id: users.id });

      if (!newUser) return c.redirect(`${base}/login?error=auth_failed`);
      userId = newUser.id;
      await recordOAuthEvent(db, c, {
        userId,
        email: providerUser.email!.toLowerCase(),
        provider: name,
        kind: "register",
        success: true,
      });
      // Credit the affiliate when the visitor arrived via ?ref=CODE — same
      // helper + self-referral guards as the password path (gaps #1683/#1684).
      await recordReferralAttribution(
        { referralCode: attr?.ref, userId, ipAddress: extractClientIp(c), userAgent: extractUserAgent(c) },
        db,
      );
      // Auto-create the affiliate profile when the signup intent opted in
      // (the affiliate landing page's "Continue with X"). Same code shape +
      // commission defaults as the password path via the shared helper.
      if (stateData.intent?.enableAffiliate) {
        try {
          await createAffiliateProfileForUser(db, {
            userId,
            name: providerUser.name,
            randomHex: (bytes) =>
              Array.from(crypto.getRandomValues(new Uint8Array(bytes)))
                .map((b) => b.toString(16).padStart(2, "0"))
                .join(""),
          });
        } catch (err) {
          console.error("[oauth] Failed to create affiliate profile:", err);
        }
      }
      // Seed onboarding tasks for the new user with their actual role so a
      // creator / affiliate gets the right starter checklist (fire-and-forget).
      c.executionCtx.waitUntil(
        seedOnboardingTasks(userId, signupRole).catch((err) =>
          console.error("[oauth] Failed to seed onboarding tasks:", err),
        ),
      );
    }

    await db.insert(oauthAccounts).values({
      userId,
      provider: name,
      providerAccountId: providerUser.id,
      email: providerUser.email!.toLowerCase(),
      displayName: providerUser.name,
      avatarUrl: providerUser.avatar ?? null,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      tokenExpiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
    } as any);
  }

  const [user] = await db.select({ id: users.id, email: users.email, role: users.role, isActive: users.isActive, isSuspended: users.isSuspended })
    .from(users).where(eq(users.id, userId)).limit(1);

  if (!user || !user.isActive || user.isSuspended) {
    await recordOAuthEvent(db, c, {
      userId: user?.id ?? null,
      email: user?.email ?? null,
      provider: name,
      kind: "oauth_login",
      success: false,
      failureReason: !user ? "unknown_user" : !user.isActive ? "account_disabled" : "account_suspended",
    });
    return c.redirect(`${base}/login?error=account_disabled`);
  }

  const redirectPath = stateData.redirect || "/dashboard";

  // Connect flow: user is already logged in — don't replace their JWT.
  // Redirect straight back so their existing session is preserved.
  if (stateData.linkUserId) {
    return c.redirect(`${base}${redirectPath}?connected=${encodeURIComponent(name)}`);
  }

  // Login/signup flow: issue a new JWT bound to a fresh session row.
  // The 3-device cap, refresh-token rotation, trusted-device flag, and
  // sliding-idle revoke all flow through createSession.
  const oauthSess = await createSession({
    db,
    userId: user.id,
    ipAddress: extractClientIp(c),
    userAgent: extractUserAgent(c),
  });
  const jwt = await createJwt(user.id, user.email, user.role, true, oauthSess.session.id);
  await markUserLogin(db, user.id);
  await recordOAuthEvent(db, c, {
    userId: user.id,
    email: user.email,
    provider: name,
    kind: "oauth_login",
    success: true,
  });

  return c.redirect(`${base}/auth/callback?token=${encodeURIComponent(jwt)}&redirect=${encodeURIComponent(redirectPath)}`);
});

// ============================================================================
// Magic Link routes (mounted at /api/auth/magic-link)
// ============================================================================

oauthRoutes.post("/magic-link", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body?.email || typeof body.email !== "string") {
    return c.json(error("VALIDATION_ERROR", "Email is required"), 400);
  }

  const email = body.email.toLowerCase().trim();
  const redirect = (body.redirect as string | undefined) || "/dashboard";
  const db = getDb();

  const [user] = await db.select({ id: users.id, email: users.email, name: users.name, isActive: users.isActive })
    .from(users).where(eq(users.email, email)).limit(1);

  if (user && user.isActive) {
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32))).map((b) => b.toString(16).padStart(2, "0")).join("");

    await db.update(magicLinkTokens).set({ used: true } as any).where(and(eq(magicLinkTokens.email, email), eq(magicLinkTokens.used, false)));
    await db.insert(magicLinkTokens).values({ email, token, expiresAt: new Date(Date.now() + 15 * 60 * 1000), redirect } as any);

    c.executionCtx.waitUntil(
      sendMagicLinkEmail(email, user.name, token).catch((err) =>
        console.error("[magic-link] Failed to send:", err),
      ),
    );
  }

  return c.json(success(null, "If an account exists for that email, a sign-in link has been sent"));
});

oauthRoutes.get("/magic-link/verify", async (c) => {
  const token = c.req.query("token");
  if (!token) return c.json(error("VALIDATION_ERROR", "Token is required"), 400);

  const db = getDb();
  const now = new Date();

  const [tokenRow] = await db.select().from(magicLinkTokens)
    .where(and(eq(magicLinkTokens.token, token), eq(magicLinkTokens.used, false)))
    .limit(1);

  if (!tokenRow || tokenRow.expiresAt <= now) {
    return c.json(error("INVALID_TOKEN", "Magic link is invalid or has expired"), 400);
  }

  await db.update(magicLinkTokens).set({ used: true } as any).where(eq(magicLinkTokens.id, tokenRow.id));

  const [user] = await db.select().from(users).where(eq(users.email, tokenRow.email)).limit(1);
  if (!user || !user.isActive || user.isSuspended) {
    return c.json(error("UNAUTHORIZED", "Account not found or disabled"), 401);
  }

  const mlSess = await createSession({
    db,
    userId: user.id,
    ipAddress: extractClientIp(c),
    userAgent: extractUserAgent(c),
  });
  const jwt = await createJwt(user.id, user.email, user.role, !!user.emailVerified, mlSess.session.id);
  await markUserLogin(db, user.id);

  return c.json(success({
    token: jwt,
    refreshToken: mlSess.refreshToken,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    redirect: tokenRow.redirect || "/dashboard",
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  }));
});

// ============================================================================
// Linked accounts management (authenticated)
// ============================================================================

oauthRoutes.get("/linked-accounts", async (c) => {
  const uid = c.var.user?.sub as string | undefined;
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  const accounts = await db.select({
    id: oauthAccounts.id,
    provider: oauthAccounts.provider,
    email: oauthAccounts.email,
    displayName: oauthAccounts.displayName,
    avatarUrl: oauthAccounts.avatarUrl,
    createdAt: oauthAccounts.createdAt,
  }).from(oauthAccounts).where(eq(oauthAccounts.userId, uid));

  const [user] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, uid)).limit(1);

  return c.json(success({ accounts, hasPassword: !!(user?.passwordHash) }));
});

oauthRoutes.delete("/unlink/:provider", async (c) => {
  const uid = c.var.user?.sub as string | undefined;
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const name = c.req.param("provider").toLowerCase();
  const db = getDb();

  const [user] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, uid)).limit(1);
  const all = await db.select({ id: oauthAccounts.id }).from(oauthAccounts).where(eq(oauthAccounts.userId, uid));

  if (!user?.passwordHash && all.length <= 1) {
    return c.json(error("FORBIDDEN", "Cannot disconnect your only sign-in method. Add a password first."), 403);
  }

  const deleted = await db.delete(oauthAccounts)
    .where(and(eq(oauthAccounts.userId, uid), eq(oauthAccounts.provider, name)))
    .returning({ id: oauthAccounts.id });

  if (!deleted.length) return c.json(error("NOT_FOUND", `No ${name} account linked`), 404);
  return c.json(success(null, `${name} account unlinked`));
});

oauthRoutes.post("/add-password", async (c) => {
  const uid = c.var.user?.sub as string | undefined;
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  if (!body?.password || body.password.length < 8) {
    return c.json(error("VALIDATION_ERROR", "Password must be at least 8 characters"), 400);
  }

  const db = getDb();
  const [user] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, uid)).limit(1);
  if (user?.passwordHash) return c.json(error("CONFLICT", "Account already has a password"), 409);

  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey("raw", encoder.encode(body.password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" }, keyMaterial, 256);
  const saltHex = Array.from(salt).map((b) => b.toString(16).padStart(2, "0")).join("");
  const hashHex = Array.from(new Uint8Array(bits)).map((b) => b.toString(16).padStart(2, "0")).join("");

  await db.update(users).set({ passwordHash: `${saltHex}:${hashHex}`, passwordChangedAt: new Date() } as any).where(eq(users.id, uid));
  return c.json(success(null, "Password set successfully"));
});

// Session management — backed by the `sessions` table (migration 0060).
// Returns rich device metadata so the user-facing /security/sessions page
// can render "Chrome on macOS, last seen 5 minutes ago, San Francisco".
// `current` flag lets the UI disable the revoke button on the row that
// represents the current device (the SessionRow component checks this
// and self-decides — no canRevoke prop drilling).
oauthRoutes.get("/sessions", async (c) => {
  const uid = c.var.user?.sub as string | undefined;
  const currentSid = c.var.user?.sid;
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  const rows = await getActiveSessions(db, uid);

  const result = rows.map((s: any) => ({
    id: s.id,
    deviceLabel: s.deviceLabel,
    ipAddress: s.ipAddress,
    ipCountry: s.ipCountry,
    trusted: s.trusted,
    createdAt: s.createdAt,
    lastSeenAt: s.lastSeenAt,
    expiresAt: s.expiresAt,
    current: currentSid ? s.id === currentSid : false,
  }));

  return c.json(success(result));
});

oauthRoutes.delete("/sessions/:id", async (c) => {
  const uid = c.var.user?.sub as string | undefined;
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  const targetId = c.req.param("id");
  // Scope the revoke to this user — a user can only revoke their own
  // session rows, not arbitrary ids. We confirm ownership first so the
  // shared revokeSession fn doesn't need user-scoping awareness.
  const [target] = await db.select({ id: sessions.id }).from(sessions)
    .where(and(eq(sessions.id, targetId), eq(sessions.userId, uid)))
    .limit(1);
  if (!target) return c.json(error("NOT_FOUND", "Session not found"), 404);

  await revokeSession(db, targetId, "user_revoke");
  return c.json(success(null, "Session revoked"));
});

oauthRoutes.delete("/sessions", async (c) => {
  const uid = c.var.user?.sub as string | undefined;
  const currentSid = c.var.user?.sid;
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  // "Log out other devices" preserves the current session so the user
  // doesn't get bounced from the page they just clicked the button on.
  await revokeAllSessionsForUser(db, uid, "user_revoke_all", currentSid);
  return c.json(success(null, "All other sessions revoked"));
});
