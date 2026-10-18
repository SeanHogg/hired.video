/**
 * OAuth sign-in use cases behind /api/auth/oauth/:provider:
 *   • startOAuth          — build the provider authorize URL (signed state)
 *   • handleOAuthCallback — code → tokens → provider user → link / find /
 *     create the hired.video user → session-bound JWT. Every outcome is a
 *     redirect URL (the browser is mid-navigation), so failures are encoded
 *     as `/login?error=…` rather than thrown.
 */

import { jwtVerify } from "jose";
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { logger } from "../../lib/logger.js";
import { seedOnboardingTasks } from "../../lib/onboarding.js";
import { UsersRepository } from "../../repositories/usersRepository.js";
import { randomHex } from "../../utils/crypto.js";
import { getJwtSecret } from "../../utils/jwt.js";
import { apiBaseUrl, frontendBaseUrl } from "../../utils/public-urls.js";
import { LoginIdentities } from "../provider-connections/login-identities.js";
import { createAffiliateProfileForUser } from "./affiliate.js";
import { recordReferralAttribution } from "./attribution.js";
import { issueJwt } from "./jwt.js";
import { markUserLogin } from "./loginStamp.js";
import { writeLoginEvent, type LoginEventInput } from "./loginEvents.js";
import { createSession } from "./session-lifecycle.js";
import { exchangeCode, fetchUserInfo, getGitHubEmail, getOAuthProvider, type OAuthProviderUser, type OAuthTokens } from "./oauthProviders.js";
import { createOAuthState, verifyOAuthState, type OAuthAttribution, type OAuthStateData, type SignupIntent } from "./oauthState.js";

export interface OAuthClient {
  ipAddress: string | null;
  userAgent: string | null;
  /** Keeps fire-and-forget work alive past the response (executionCtx.waitUntil). */
  waitUntil: (p: Promise<unknown>) => void;
}

const callbackUrlFor = (provider: string) => `${apiBaseUrl()}/api/auth/oauth/${provider}/callback`;

// ─── Start ───────────────────────────────────────────────────────────────────

export async function startOAuth(
  provider: string,
  input: { redirect: string; linkToken?: string; attribution: OAuthAttribution; intent: SignupIntent },
): Promise<string> {
  const cfg = getOAuthProvider(provider);
  if (!cfg) throw new DomainError(404, "NOT_FOUND", `Unknown provider: ${provider}`);
  if (!cfg.clientId()) throw new DomainError(503, "SERVICE_UNAVAILABLE", `${provider} login not configured`);

  // If the user is already logged in (connecting from Settings), embed their userId in state
  // so the callback links to the existing account instead of doing email-based lookup.
  let linkUserId: string | undefined;
  if (input.linkToken) {
    try {
      const { payload } = await jwtVerify(input.linkToken, new TextEncoder().encode(getJwtSecret()), { algorithms: ["HS256"] });
      linkUserId = payload.sub as string;
    } catch { /* invalid token — treat as unauthenticated flow */ }
  }

  const state = await createOAuthState(input.redirect, linkUserId, input.attribution, input.intent);
  const params = new URLSearchParams({
    client_id: cfg.clientId(),
    redirect_uri: callbackUrlFor(provider),
    response_type: "code",
    scope: cfg.scopes.join(" "),
    state,
    ...cfg.extraAuthParams,
  });
  return `${cfg.authUrl}?${params.toString()}`;
}

// ─── Callback ────────────────────────────────────────────────────────────────

export async function handleOAuthCallback(
  provider: string,
  query: { code?: string; state?: string; error?: string },
  client: OAuthClient,
): Promise<string> {
  const cfg = getOAuthProvider(provider);
  const base = frontendBaseUrl();
  if (!cfg) return `${base}/login?error=unknown_provider`;

  if (query.error) return `${base}/login?error=${encodeURIComponent(query.error)}`;
  if (!query.code || !query.state) return `${base}/login?error=missing_params`;

  const stateData = await verifyOAuthState(query.state);
  if (!stateData) return `${base}/login?error=invalid_state`;

  let tokens: OAuthTokens;
  let providerUser: OAuthProviderUser;
  try {
    tokens = await exchangeCode(cfg, query.code, callbackUrlFor(provider));
    providerUser = cfg.parseUser(await fetchUserInfo(cfg, tokens.access_token));
    if (provider === "github" && !providerUser.email) {
      providerUser.email = await getGitHubEmail(tokens.access_token);
    }
  } catch (err) {
    logger.error(`[oauth:${provider}] Failed`, err);
    return `${base}/login?error=auth_failed`;
  }

  if (!providerUser.email && !stateData.linkUserId) return `${base}/login?error=no_email`;

  const db = getDb();
  const recordEvent = (ev: Omit<LoginEventInput, "provider">) =>
    writeLoginEvent(db, { clientIp: client.ipAddress, userAgent: client.userAgent }, { ...ev, provider });

  const userId = await resolveOAuthUser(provider, providerUser, tokens, stateData, client, recordEvent);
  if (!userId) return `${base}/login?error=auth_failed`;

  const users = new UsersRepository(db);
  const user = await users.findById(userId);
  if (!user || !user.isActive || user.isSuspended) {
    await recordEvent({
      userId: user?.id ?? null,
      email: user?.email ?? null,
      kind: "oauth_login",
      success: false,
      failureReason: !user ? "unknown_user" : !user.isActive ? "account_disabled" : "account_suspended",
    });
    return `${base}/login?error=account_disabled`;
  }

  const redirectPath = stateData.redirect || "/dashboard";

  // Connect flow: user is already logged in — don't replace their JWT.
  // Redirect straight back so their existing session is preserved.
  if (stateData.linkUserId) {
    return `${base}${redirectPath}?connected=${encodeURIComponent(provider)}`;
  }

  // Login/signup flow: issue a new JWT bound to a fresh session row (the
  // 3-device cap, refresh rotation and idle revoke flow through createSession).
  const { session } = await createSession({ db, userId: user.id, ipAddress: client.ipAddress, userAgent: client.userAgent });
  const jwt = await issueJwt(
    { sub: user.id, email: user.email, roles: [user.role], emailVerified: true, mustChangePassword: false, sid: session.id },
    getJwtSecret(),
  );
  await markUserLogin(db, user.id);
  await recordEvent({ userId: user.id, email: user.email, kind: "oauth_login", success: true });

  return `${base}/auth/callback?token=${encodeURIComponent(jwt)}&redirect=${encodeURIComponent(redirectPath)}`;
}

/**
 * Link the provider identity and return the hired.video user it signs in
 * as: an already-linked identity (re-linked on a connect flow), a connect
 * flow's logged-in user, or the user found / created by email. Null when
 * the new-user insert returned nothing.
 */
async function resolveOAuthUser(
  provider: string,
  providerUser: OAuthProviderUser,
  tokens: OAuthTokens,
  stateData: OAuthStateData,
  client: OAuthClient,
  recordEvent: (ev: Omit<LoginEventInput, "provider">) => Promise<void>,
): Promise<string | null> {
  const db = getDb();
  // Provider tokens are sealed by the login-identities adapter
  // (provider_connections purpose "login", connection-secrets.ts).
  const loginIdentities = new LoginIdentities(db);
  const providerTokens = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
  };
  const identity = {
    provider,
    providerAccountId: providerUser.id,
    displayName: providerUser.name,
    avatarUrl: providerUser.avatar ?? null,
    tokens: providerTokens,
  };

  const existingOAuth = await loginIdentities.findByProviderAccount(provider, providerUser.id);
  if (existingOAuth) {
    // Already linked — on a connect flow for a different account, re-link it
    // to the current user (they proved ownership of both via link_token + OAuth).
    const userId = stateData.linkUserId ?? existingOAuth.userId;
    await loginIdentities.refresh(existingOAuth.id, {
      userId,
      displayName: providerUser.name,
      avatarUrl: providerUser.avatar ?? null,
      tokens: providerTokens,
    });
    return userId;
  }

  if (stateData.linkUserId) {
    // Linking a new provider to an existing logged-in user — skip email lookup entirely
    await loginIdentities.link({ ...identity, userId: stateData.linkUserId, email: providerUser.email?.toLowerCase() ?? null });
    return stateData.linkUserId;
  }

  // New login flow — find or create user by email
  const email = providerUser.email.toLowerCase();
  const users = new UsersRepository(db);
  const existing = await users.findByEmail(email);
  let userId: string;
  if (existing) {
    userId = existing.id;
  } else {
    const created = await createOAuthUser(email, providerUser.name, stateData, client, recordEvent);
    if (!created) return null;
    userId = created;
  }

  await loginIdentities.link({ ...identity, userId, email });
  return userId;
}

/** Insert the user for a first-time OAuth sign-in and run the signup side
 *  effects (login event, referral credit, affiliate profile, onboarding). */
async function createOAuthUser(
  email: string,
  name: string,
  stateData: OAuthStateData,
  client: OAuthClient,
  recordEvent: (ev: Omit<LoginEventInput, "provider">) => Promise<void>,
): Promise<string | null> {
  const db = getDb();
  const attr = stateData.attr;
  // Honour the signed signup intent so OAuth signups from the affiliate /
  // creator landing pages land on the right role (parity with password
  // register). Defaults to job_seeker for organic "Continue with X".
  const signupRole = stateData.intent?.role ?? "job_seeker";
  const newUser = await new UsersRepository(db).insertOne({
    email,
    name,
    passwordHash: null,
    emailVerified: true,
    role: signupRole,
    // Creator signups land in channel-mode immediately so their /people
    // profile renders as a channel from day one (mirrors handleRegister).
    ...(signupRole === "creator" ? { profileMode: "channel" } : {}),
    // Pin the signup network attribution to the user row so spam
    // investigation works the same for password and OAuth signups.
    signupIp: client.ipAddress,
    signupUserAgent: client.userAgent,
    // Campaign attribution carried through the signed OAuth state (gap #1683).
    utmSource: attr?.utmSource ?? null,
    utmMedium: attr?.utmMedium ?? null,
    utmCampaign: attr?.utmCampaign ?? null,
    utmTerm: attr?.utmTerm ?? null,
    utmContent: attr?.utmContent ?? null,
    landingReferrer: attr?.landingReferrer ?? null,
  });
  if (!newUser) return null;
  const userId = newUser.id;

  await recordEvent({ userId, email, kind: "register", success: true });
  // Credit the affiliate when the visitor arrived via ?ref=CODE — same
  // helper + self-referral guards as the password path (gaps #1683/#1684).
  await recordReferralAttribution(
    { referralCode: attr?.ref, userId, ipAddress: client.ipAddress, userAgent: client.userAgent },
    db,
  );
  // Auto-create the affiliate profile when the signup intent opted in.
  if (stateData.intent?.enableAffiliate) {
    try {
      await createAffiliateProfileForUser(db, { userId, name, randomHex });
    } catch (err) {
      logger.error("[oauth] Failed to create affiliate profile", err);
    }
  }
  // Seed onboarding tasks with the actual role (fire-and-forget).
  client.waitUntil(
    seedOnboardingTasks(userId, signupRole).catch((err) =>
      logger.error("[oauth] Failed to seed onboarding tasks", err),
    ),
  );
  return userId;
}
