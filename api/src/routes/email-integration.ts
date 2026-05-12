/**
 * /api/integrations/email — connect / list / disconnect mailboxes,
 * manage classification rules, trigger manual sync, fetch sync history
 * + digest.
 *
 * OAuth flow:
 *   GET  /:provider/connect   → redirect to provider auth
 *   GET  /:provider/callback  → token exchange, store encrypted refresh
 *   GET  /accounts            → list mailboxes
 *   DELETE /accounts/:id      → disconnect
 *   POST /sync/now            → run sync immediately for all accounts
 *
 * Rules:
 *   GET    /rules
 *   POST   /rules
 *   PATCH  /rules/:id
 *   DELETE /rules/:id
 *
 * Sync history:
 *   GET    /sync-runs
 */

import { Hono } from "hono";
import { jwtVerify } from "jose";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb } from "../db/index.js";
import { buildRepos } from "../repositories/index.js";
import {
  EMAIL_PROVIDER_CONFIG,
  type EmailProviderId,
  createState,
  verifyState,
  exchangeCode,
  encryptToken,
} from "../services/email-integration/oauth.js";
import { syncAccount, syncAllDueAccounts } from "../services/email-integration/sync.js";
import { createLLMClient } from "../services/adapters/llm-client.js";

function getEnv(key: string): string {
  return process.env[key] || (globalThis as any).__ENV?.[key] || "";
}

function getApiBase(): string {
  return getEnv("API_URL") || "https://api.hired.video";
}
function getFrontendBase(): string {
  return (getEnv("FRONTEND_URL").split(",")[0] ?? "").trim() || "https://hired.video";
}
function callbackUrl(provider: string): string {
  return `${getApiBase()}/api/integrations/email/${provider}/callback`;
}

/** Top-level browser navigation can't carry an Authorization header — the
 *  /connect route is in the public allowlist (see app.ts EMAIL_OAUTH_PUBLIC_ROUTE)
 *  and authenticates the caller via a short-lived `link_token` JWT in the
 *  query string. Mirrors the existing `/api/auth/oauth/:provider` pattern. */
async function userIdFromLinkToken(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const secret = getEnv("JWT_SECRET");
  if (!secret) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ["HS256"],
    });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

/** Validate a redirect path is in-app — must start with `/` and not begin
 *  with `//` or `/\\` (which most browsers parse as a scheme-relative URL
 *  to another host). Falls back to the default when invalid. Closes the
 *  open-redirect class noted in gap #540. */
function safeRedirect(raw: string | undefined, fallback: string): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  return raw;
}

export const emailIntegrationRoutes = new Hono<AppEnv>();

// ── Connect / callback ───────────────────────────────────────────────────────

emailIntegrationRoutes.get("/:provider/connect", async (c) => {
  const base = getFrontendBase();
  const uid = await userIdFromLinkToken(c.req.query("link_token"));
  if (!uid) {
    // No token / invalid token — bounce to login with a redirect back to
    // the integrations tab so a fresh sign-in lands the user on the right
    // surface to retry.
    return c.redirect(`${base}/login?redirect=${encodeURIComponent("/settings?tab=email")}`);
  }
  // Per-route email-verify gate. We bypass `emailVerifiedMiddleware`
  // globally for this public route because the middleware sees no
  // `c.var.user` (auth was bypassed) and 403s, which is a dead-end on a
  // browser navigation. Surface the verification flow instead.
  const repos = buildRepos(getDb());
  const user = await repos.users.findById(uid);
  if (!user) {
    return c.redirect(`${base}/login?redirect=${encodeURIComponent("/settings?tab=email")}`);
  }
  if (!user.emailVerified) {
    return c.redirect(
      `${base}/verify-email?redirect=${encodeURIComponent("/settings?tab=email")}`,
    );
  }
  const provider = c.req.param("provider").toLowerCase() as EmailProviderId;
  const cfg = EMAIL_PROVIDER_CONFIG[provider];
  if (!cfg) return c.json(error("NOT_FOUND", `Unknown provider: ${provider}`), 404);
  if (!cfg.clientId() || !cfg.clientSecret()) {
    return c.json(error("SERVICE_UNAVAILABLE", `${provider} integration not configured`), 503);
  }
  const redirect = safeRedirect(c.req.query("redirect"), "/settings?tab=email");
  const nonce = crypto.randomUUID();
  const state = await createState({ userId: uid, ts: Date.now(), nonce, redirect });

  const params = new URLSearchParams({
    client_id: cfg.clientId(),
    redirect_uri: callbackUrl(provider),
    response_type: "code",
    scope: cfg.scopes.join(" "),
    state,
    ...cfg.authParams,
  });
  return c.redirect(`${cfg.authUrl}?${params.toString()}`);
});

emailIntegrationRoutes.get("/:provider/callback", async (c) => {
  const provider = c.req.param("provider").toLowerCase() as EmailProviderId;
  const cfg = EMAIL_PROVIDER_CONFIG[provider];
  const base = getFrontendBase();
  if (!cfg) return c.redirect(`${base}/settings?tab=email&error=unknown_provider`);

  const code = c.req.query("code");
  const stateParam = c.req.query("state");
  if (!code || !stateParam) {
    return c.redirect(`${base}/settings?tab=email&error=missing_params`);
  }
  const state = await verifyState(stateParam);
  if (!state) return c.redirect(`${base}/settings?tab=email&error=invalid_state`);

  let tokens: Awaited<ReturnType<typeof exchangeCode>>;
  let mailboxEmail: string;
  try {
    tokens = await exchangeCode(provider, code, callbackUrl(provider));
    mailboxEmail = await cfg.fetchAccountEmail(tokens.access_token);
  } catch (err) {
    console.error(`[email-integration:${provider}] callback failed:`, err);
    return c.redirect(`${base}/settings?tab=email&error=auth_failed`);
  }
  if (!tokens.refresh_token) {
    // Without a refresh token we can't sync — bounce so the user
    // re-consents (Google sometimes skips refresh on repeat consent).
    return c.redirect(`${base}/settings?tab=email&error=no_refresh_token`);
  }

  const repos = buildRepos(getDb());
  const encryptedRefresh = await encryptToken(tokens.refresh_token);
  await repos.externalEmailAccounts.upsert({
    userId: state.userId,
    provider,
    accountEmail: mailboxEmail,
    accountLabel: mailboxEmail,
    oauthRefreshTokenEnc: encryptedRefresh,
    scopes: tokens.scope?.split(" ") ?? cfg.scopes,
    status: "active",
    lastError: null,
  } as any);

  return c.redirect(
    `${base}${state.redirect}${state.redirect.includes("?") ? "&" : "?"}connected=${provider}`,
  );
});

// ── Account management ───────────────────────────────────────────────────────

emailIntegrationRoutes.get("/accounts", async (c) => {
  const uid = c.var.user?.sub;
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const repos = buildRepos(getDb());
  const accounts = await repos.externalEmailAccounts.findAllForUser(uid);
  return c.json(
    success(
      accounts.map((a) => ({
        id: a.id,
        provider: a.provider,
        accountEmail: a.accountEmail,
        accountLabel: a.accountLabel,
        status: a.status,
        lastSyncedAt: a.lastSyncedAt?.toISOString() ?? null,
        lastError: a.lastError,
      })),
    ),
  );
});

emailIntegrationRoutes.patch("/accounts/:id", async (c) => {
  const uid = c.var.user?.sub;
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const body = await c.req.json().catch(() => ({}));
  const repos = buildRepos(getDb());
  const patch: Record<string, unknown> = {};
  if (typeof body.accountLabel === "string") patch.accountLabel = body.accountLabel.slice(0, 120);
  if (body.status === "active" || body.status === "paused") patch.status = body.status;
  if (Object.keys(patch).length === 0) {
    return c.json(error("VALIDATION_ERROR", "No supported fields in patch"), 400);
  }
  await repos.externalEmailAccounts.patch(c.req.param("id"), uid, patch as any);
  return c.json(success({ success: true }));
});

emailIntegrationRoutes.delete("/accounts/:id", async (c) => {
  const uid = c.var.user?.sub;
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const repos = buildRepos(getDb());
  await repos.externalEmailAccounts.remove(c.req.param("id"), uid);
  return c.json(success({ success: true }));
});

// ── Rules CRUD ───────────────────────────────────────────────────────────────

emailIntegrationRoutes.get("/rules", async (c) => {
  const uid = c.var.user?.sub;
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const repos = buildRepos(getDb());
  const rules = await repos.emailUserRules.findAllForUser(uid);
  return c.json(success(rules));
});

emailIntegrationRoutes.post("/rules", async (c) => {
  const uid = c.var.user?.sub;
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body.name !== "string" || !Array.isArray(body.conditions)) {
    return c.json(error("VALIDATION_ERROR", "Required: name, conditions[]"), 400);
  }
  const repos = buildRepos(getDb());
  const row = await repos.emailUserRules.insert({
    userId: uid,
    name: body.name.slice(0, 120),
    conditions: body.conditions,
    actionCategory: typeof body.actionCategory === "string" ? body.actionCategory : "other",
    actionScore: String(typeof body.actionScore === "number" ? body.actionScore : 1),
    isEnabled: body.isEnabled !== false,
    priority: typeof body.priority === "number" ? body.priority : 100,
  } as any);
  return c.json(success(row), 201);
});

emailIntegrationRoutes.patch("/rules/:id", async (c) => {
  const uid = c.var.user?.sub;
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const body = await c.req.json().catch(() => ({}));
  const repos = buildRepos(getDb());
  const patch: Record<string, unknown> = {};
  for (const k of ["name", "actionCategory"] as const) {
    if (typeof body[k] === "string") patch[k] = body[k];
  }
  if (Array.isArray(body.conditions)) patch.conditions = body.conditions;
  if (typeof body.actionScore === "number") patch.actionScore = String(body.actionScore);
  if (typeof body.isEnabled === "boolean") patch.isEnabled = body.isEnabled;
  if (typeof body.priority === "number") patch.priority = body.priority;
  await repos.emailUserRules.patch(c.req.param("id"), uid, patch as any);
  return c.json(success({ success: true }));
});

emailIntegrationRoutes.delete("/rules/:id", async (c) => {
  const uid = c.var.user?.sub;
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const repos = buildRepos(getDb());
  await repos.emailUserRules.remove(c.req.param("id"), uid);
  return c.json(success({ success: true }));
});

// ── Manual sync + history ────────────────────────────────────────────────────

emailIntegrationRoutes.post("/sync/now", async (c) => {
  const uid = c.var.user?.sub;
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const repos = buildRepos(getDb());
  const accounts = await repos.externalEmailAccounts.findActiveForUser(uid);
  if (accounts.length === 0) {
    return c.json(success({ accounts: 0, summaries: [] }));
  }
  const llm = createLLMClient(c.env, c.var.user);
  const summaries = [];
  for (const account of accounts) {
    summaries.push(await syncAccount({ repos, llm }, account));
  }
  return c.json(success({ accounts: accounts.length, summaries }));
});

emailIntegrationRoutes.get("/sync-runs", async (c) => {
  const uid = c.var.user?.sub;
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const limit = Math.min(50, Math.max(1, Number(c.req.query("limit") ?? "10") || 10));
  const repos = buildRepos(getDb());
  const runs = await repos.emailSyncRuns.findRecentForUser(uid, limit);
  return c.json(success(runs));
});

// ── Cron-driven all-accounts sweep (admin / scheduled.ts callable) ────────────

export async function runEmailSyncSweep(
  env: { BUILDERFORCE_API_KEY?: string; BUILDERFORCE_GATEWAY_URL?: string } | undefined,
): Promise<void> {
  const repos = buildRepos(getDb());
  const llm = createLLMClient(env, null);
  await syncAllDueAccounts({ repos, llm });
}

