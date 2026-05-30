/**
 * LMS connector OAuth + manual-config endpoints (#1504).
 *
 * Closes the operator side of the #200 LMS adapter chain: the publish
 * pipeline already knows how to push a SCORM zip via each provider's
 * REST API ([services/lms/*.ts](../services/lms)), but until a course
 * author connects a real connector the `lmsConnectors` table is empty.
 * This route lands the credential.
 *
 * Two paths exist because LMS auth schemes vary widely across the five
 * supported providers:
 *
 *   • OAuth 2.0 authorization-code flow (Docebo, TalentLMS optional,
 *     SuccessFactors via OData) — `GET /api/lms-oauth/:provider/start`
 *     returns the provider's authorize URL; the provider redirects back
 *     to `GET /api/lms-oauth/:provider/callback` with `code` + `state`;
 *     we exchange for an access token and upsert the connector row.
 *
 *   • API-key / Basic-auth (TalentLMS default, Cornerstone /
 *     Workday-Learning via SAML bearer assertion are too heavy for the
 *     MVP) — `POST /api/lms-oauth/:provider/configure` writes the
 *     plaintext API key into `lmsConnectors.accessToken`. The token is
 *     scoped to the user's tenant subdomain and never touches a
 *     credential store outside the per-tenant connector row.
 *
 * Docebo is the reference OAuth impl because it ships clean OAuth 2.0
 * (no SAML assertion, no XML envelope, no Bearer-with-tenant-id
 * gymnastics). Adding the next OAuth provider is one new entry in the
 * `OAUTH_PROVIDERS` registry below + reusing the existing exchange
 * helper — no new route handlers.
 *
 * State is HMAC-signed (same secret as the user-auth OAuth flow in
 * [oauth.ts](./oauth.ts)) so the callback can verify both `userId` and
 * `provider` round-tripped unchanged from start to callback.
 */

import { Hono } from "hono";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { SignJWT, jwtVerify } from "jose";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { LMS_PROVIDERS, type LmsProvider } from "../db/schema/courses.js";

const { lmsConnectors } = schema;

export const lmsOauthRoutes = new Hono<AppEnv>();

function uid(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}

function getEnv(key: string): string {
  return process.env[key] || (globalThis as any).__ENV?.[key] || "";
}

function getJwtSecret(): string {
  return getEnv("JWT_SECRET") || "dev-secret-not-for-prod";
}

function getApiBase(): string {
  return getEnv("API_URL") || "https://api.hired.video";
}

function getFrontendBase(): string {
  return (getEnv("FRONTEND_URL") || "https://hired.video").split(",")[0]?.trim() ?? "https://hired.video";
}

/** OAuth 2.0 authorization-code config per provider. Adding a new
 *  provider = add an entry here; the start/callback handlers are
 *  provider-agnostic. */
interface OAuthProviderConfig {
  /** Build the authorize URL given the tenant base URL + redirect URI. */
  buildAuthorizeUrl(args: { baseUrl: string; redirectUri: string; clientId: string; state: string; scope: string }): string;
  /** Exchange the auth code for tokens. */
  exchangeToken(args: {
    baseUrl: string;
    redirectUri: string;
    clientId: string;
    clientSecret: string;
    code: string;
  }): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number; scope?: string }>;
  /** Env-var prefix — `${PREFIX}_CLIENT_ID`, `${PREFIX}_CLIENT_SECRET`. */
  envPrefix: string;
  /** Default scopes requested at authorize-time. */
  defaultScope: string;
}

const OAUTH_PROVIDERS: Partial<Record<LmsProvider, OAuthProviderConfig>> = {
  docebo: {
    envPrefix: "DOCEBO_LMS",
    defaultScope: "api",
    buildAuthorizeUrl: ({ baseUrl, redirectUri, clientId, state, scope }) => {
      const url = new URL("/oauth2/authorize", baseUrl);
      url.searchParams.set("client_id", clientId);
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("scope", scope);
      url.searchParams.set("state", state);
      return url.toString();
    },
    exchangeToken: async ({ baseUrl, redirectUri, clientId, clientSecret, code }) => {
      const tokenUrl = new URL("/oauth2/token", baseUrl).toString();
      const body = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      });
      const res = await fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Docebo token exchange ${res.status}: ${text.slice(0, 400)}`);
      }
      const json = (await res.json()) as {
        access_token: string;
        refresh_token?: string;
        expires_in?: number;
        scope?: string;
      };
      return {
        accessToken: json.access_token,
        refreshToken: json.refresh_token,
        expiresIn: json.expires_in,
        scope: json.scope,
      };
    },
  },
};

const StartSchema = z.object({
  baseUrl: z.string().url(),
  displayName: z.string().max(255).optional(),
});

async function signState(payload: Record<string, unknown>): Promise<string> {
  const secret = new TextEncoder().encode(getJwtSecret());
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(secret);
}

async function verifyState(token: string): Promise<Record<string, unknown> | null> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(getJwtSecret()), {
      algorithms: ["HS256"],
    });
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Returns the authorize URL the caller should redirect the browser to.
 *  The frontend can render this as a "Connect Docebo" button — clicking
 *  it sends the user to the provider for consent. */
lmsOauthRoutes.post("/:provider/start", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const provider = c.req.param("provider") as LmsProvider;
  if (!LMS_PROVIDERS.includes(provider)) {
    return c.json(error("VALIDATION_ERROR", `Unknown LMS provider: ${provider}`), 400);
  }
  const cfg = OAUTH_PROVIDERS[provider];
  if (!cfg) {
    return c.json(
      error(
        "NOT_OAUTH_PROVIDER",
        `${provider} doesn't use OAuth 2.0 — POST /api/lms-oauth/${provider}/configure with an API key instead.`,
      ),
      409,
    );
  }
  const parsed = StartSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body"), 400);

  const clientId = getEnv(`${cfg.envPrefix}_CLIENT_ID`);
  if (!clientId) {
    return c.json(
      error("SERVICE_UNAVAILABLE", `${provider} OAuth client is not configured on this deployment`),
      503,
    );
  }
  const redirectUri = `${getApiBase()}/api/lms-oauth/${provider}/callback`;
  const state = await signState({
    userId,
    provider,
    baseUrl: parsed.data.baseUrl,
    displayName: parsed.data.displayName ?? null,
  });
  const authorizeUrl = cfg.buildAuthorizeUrl({
    baseUrl: parsed.data.baseUrl,
    redirectUri,
    clientId,
    state,
    scope: cfg.defaultScope,
  });
  return c.json(success({ authorizeUrl }), 200);
});

/** Provider callback — exchanges the code for tokens, upserts a row
 *  in lmsConnectors keyed on (userId, provider), and redirects the
 *  browser back to the connector settings page. */
lmsOauthRoutes.get("/:provider/callback", async (c) => {
  const provider = c.req.param("provider") as LmsProvider;
  if (!LMS_PROVIDERS.includes(provider)) {
    return c.redirect(`${getFrontendBase()}/services/creator/courses?lms_error=unknown_provider`);
  }
  const cfg = OAUTH_PROVIDERS[provider];
  if (!cfg) {
    return c.redirect(`${getFrontendBase()}/services/creator/courses?lms_error=not_oauth`);
  }
  const code = c.req.query("code");
  const state = c.req.query("state");
  const providerErr = c.req.query("error");
  if (providerErr) {
    return c.redirect(`${getFrontendBase()}/services/creator/courses?lms_error=${encodeURIComponent(providerErr)}`);
  }
  if (!code || !state) {
    return c.redirect(`${getFrontendBase()}/services/creator/courses?lms_error=missing_params`);
  }
  const stateData = await verifyState(state);
  if (!stateData || stateData.provider !== provider) {
    return c.redirect(`${getFrontendBase()}/services/creator/courses?lms_error=invalid_state`);
  }
  const userId = stateData.userId as string;
  const baseUrl = stateData.baseUrl as string;
  const displayName = (stateData.displayName as string | null) ?? null;

  const clientId = getEnv(`${cfg.envPrefix}_CLIENT_ID`);
  const clientSecret = getEnv(`${cfg.envPrefix}_CLIENT_SECRET`);
  if (!clientId || !clientSecret) {
    return c.redirect(`${getFrontendBase()}/services/creator/courses?lms_error=not_configured`);
  }
  const redirectUri = `${getApiBase()}/api/lms-oauth/${provider}/callback`;

  let tokens: Awaited<ReturnType<typeof cfg.exchangeToken>>;
  try {
    tokens = await cfg.exchangeToken({ baseUrl, redirectUri, clientId, clientSecret, code });
  } catch (e) {
    console.error(`[lms-oauth:${provider}] token exchange failed:`, e);
    return c.redirect(`${getFrontendBase()}/services/creator/courses?lms_error=token_exchange_failed`);
  }

  const db = getDb();
  const expiresAt = tokens.expiresIn ? new Date(Date.now() + tokens.expiresIn * 1000) : null;
  const [existing] = await db.select({ id: lmsConnectors.id })
    .from(lmsConnectors)
    .where(and(eq(lmsConnectors.userId, userId), eq(lmsConnectors.provider, provider)))
    .limit(1);

  if (existing) {
    await db.update(lmsConnectors).set({
      baseUrl,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken ?? null,
      scope: tokens.scope ?? null,
      expiresAt,
      status: "connected",
      lastError: null,
      displayName: displayName ?? undefined,
      updatedAt: new Date(),
    } as any).where(eq(lmsConnectors.id, existing.id));
  } else {
    await db.insert(lmsConnectors).values({
      userId,
      provider,
      displayName,
      baseUrl,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken ?? null,
      scope: tokens.scope ?? null,
      expiresAt,
      status: "connected",
    } as any);
  }

  return c.redirect(`${getFrontendBase()}/services/creator/courses?lms_connected=${provider}`);
});

const ConfigureSchema = z.object({
  baseUrl: z.string().url(),
  apiKey: z.string().min(1).max(2000),
  displayName: z.string().max(255).optional(),
  /** Provider-specific extras (Cornerstone corpName, Workday tenant alias) */
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/** Manual / API-key path — covers TalentLMS, Cornerstone, Workday Learning,
 *  SuccessFactors. These either use Basic-auth API keys (TalentLMS) or
 *  SAML bearer assertions whose XML envelopes don't fit a generic OAuth
 *  flow. We write the credential straight into `lmsConnectors.accessToken`
 *  so the existing adapter chain (publishCourse / checkStatus / revoke)
 *  picks it up unchanged. */
lmsOauthRoutes.post("/:provider/configure", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const provider = c.req.param("provider") as LmsProvider;
  if (!LMS_PROVIDERS.includes(provider)) {
    return c.json(error("VALIDATION_ERROR", `Unknown LMS provider: ${provider}`), 400);
  }
  const parsed = ConfigureSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body"), 400);

  const db = getDb();
  const [existing] = await db.select({ id: lmsConnectors.id })
    .from(lmsConnectors)
    .where(and(eq(lmsConnectors.userId, userId), eq(lmsConnectors.provider, provider)))
    .limit(1);

  if (existing) {
    const [updated] = await db.update(lmsConnectors).set({
      baseUrl: parsed.data.baseUrl,
      accessToken: parsed.data.apiKey,
      displayName: parsed.data.displayName ?? null,
      metadata: parsed.data.metadata ?? null,
      status: "connected",
      lastError: null,
      updatedAt: new Date(),
    } as any).where(eq(lmsConnectors.id, existing.id)).returning();
    return c.json(success(updated), 200);
  }
  const [created] = await db.insert(lmsConnectors).values({
    userId,
    provider,
    baseUrl: parsed.data.baseUrl,
    accessToken: parsed.data.apiKey,
    displayName: parsed.data.displayName ?? null,
    metadata: parsed.data.metadata ?? null,
    status: "connected",
  } as any).returning();
  return c.json(success(created), 201);
});
