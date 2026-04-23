import { Hono } from "hono";
import { SignJWT } from "jose";
import { and, eq } from "drizzle-orm";
import type { Variables } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { sendMagicLinkEmail } from "../services/adapters/email.js";
import { seedOnboardingTasks } from "../lib/onboarding.js";
import { markUserLogin } from "./auth.js";

const { users, oauthAccounts, magicLinkTokens, emailVerificationTokens, refreshTokens } = schema;

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

async function createJwt(sub: string, email: string, role: string, emailVerified: boolean): Promise<string> {
  const secret = new TextEncoder().encode(getJwtSecret());
  return new SignJWT({ email, roles: [role], emailVerified, mustChangePassword: false })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
}

async function createOAuthState(redirect: string, linkUserId?: string): Promise<string> {
  const secret = getJwtSecret();
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const payload = JSON.stringify({ nonce, redirect: redirect || "/dashboard", ts: Date.now(), ...(linkUserId ? { linkUserId } : {}) });
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const sigHex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return btoa(payload + "|" + sigHex);
}

async function verifyOAuthState(state: string): Promise<{ redirect: string; linkUserId?: string } | null> {
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
    const { redirect, ts, linkUserId } = JSON.parse(payload);
    if (Date.now() - ts > 10 * 60 * 1000) return null;
    return { redirect: redirect || "/dashboard", linkUserId };
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
    scopes: ["openid", "profile", "email", "User.Read"],
    clientId: () => getEnv("MICROSOFT_CLIENT_ID"),
    clientSecret: () => getEnv("MICROSOFT_CLIENT_SECRET"),
    parseUser: (d) => ({ id: d.id, email: d.mail ?? d.userPrincipalName ?? "", name: d.displayName ?? d.mail }),
  },
};

async function exchangeCode(cfg: ProviderCfg, code: string, redirectUri: string) {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: cfg.clientId(),
    client_secret: cfg.clientSecret(),
  });
  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: params.toString(),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
  return res.json() as Promise<{ access_token: string; refresh_token?: string; expires_in?: number }>;
}

async function fetchUserInfo(cfg: ProviderCfg, accessToken: string) {
  const res = await fetch(cfg.userInfoUrl, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`UserInfo fetch failed: ${res.status}`);
  return res.json();
}

async function getGitHubEmail(accessToken: string): Promise<string> {
  try {
    const res = await fetch("https://api.github.com/user/emails", {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
    if (!res.ok) return "";
    const emails = await res.json() as Array<{ email: string; primary: boolean; verified: boolean }>;
    return emails.find((e) => e.primary && e.verified)?.email ?? emails[0]?.email ?? "";
  } catch {
    return "";
  }
}

async function storeRefreshToken(userId: string): Promise<void> {
  const db = getDb();
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  await db.insert(refreshTokens).values({
    userId,
    token,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  } as any);
}

export const oauthRoutes = new Hono<{ Variables: Variables }>();

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
      const { jwtVerify } = await import("jose");
      const { payload } = await jwtVerify(linkToken, new TextEncoder().encode(getJwtSecret()), { algorithms: ["HS256"] });
      linkUserId = payload.sub as string;
    } catch { /* invalid token — treat as unauthenticated flow */ }
  }

  const state = await createOAuthState(redirect, linkUserId);
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
      const [newUser] = await db.insert(users).values({
        email: providerUser.email!.toLowerCase(),
        name: providerUser.name,
        passwordHash: null,
        emailVerified: true,
        role: "job_seeker",
      } as any).returning({ id: users.id });

      if (!newUser) return c.redirect(`${base}/login?error=auth_failed`);
      userId = newUser.id;
      // Seed onboarding tasks for the new user (fire-and-forget)
      c.executionCtx.waitUntil(
        seedOnboardingTasks(userId, "job_seeker").catch((err) =>
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
    return c.redirect(`${base}/login?error=account_disabled`);
  }

  const redirectPath = stateData.redirect || "/dashboard";

  // Connect flow: user is already logged in — don't replace their JWT.
  // Redirect straight back so their existing session is preserved.
  if (stateData.linkUserId) {
    return c.redirect(`${base}${redirectPath}?connected=${encodeURIComponent(name)}`);
  }

  // Login/signup flow: issue a new JWT
  await storeRefreshToken(userId);
  const jwt = await createJwt(user.id, user.email, user.role, true);
  await markUserLogin(db, user.id);

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

  await storeRefreshToken(user.id);
  const jwt = await createJwt(user.id, user.email, user.role, !!user.emailVerified);
  await markUserLogin(db, user.id);

  return c.json(success({
    token: jwt,
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

oauthRoutes.get("/sessions", async (c) => {
  const uid = c.var.user?.sub as string | undefined;
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  const sessions = await db.select({ id: refreshTokens.id, createdAt: refreshTokens.createdAt, expiresAt: refreshTokens.expiresAt })
    .from(refreshTokens)
    .where(and(eq(refreshTokens.userId, uid), eq(refreshTokens.revoked, false)));

  return c.json(success(sessions));
});

oauthRoutes.delete("/sessions/:id", async (c) => {
  const uid = c.var.user?.sub as string | undefined;
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  await db.update(refreshTokens).set({ revoked: true } as any)
    .where(and(eq(refreshTokens.id, c.req.param("id")), eq(refreshTokens.userId, uid)));

  return c.json(success(null, "Session revoked"));
});

oauthRoutes.delete("/sessions", async (c) => {
  const uid = c.var.user?.sub as string | undefined;
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  await db.update(refreshTokens).set({ revoked: true } as any).where(eq(refreshTokens.userId, uid));
  return c.json(success(null, "All sessions revoked"));
});
