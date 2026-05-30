/**
 * /api/integrations/email — connect / list / disconnect mailboxes,
 * manage classification rules, fetch sync history + digest.
 *
 * OAuth flow:
 *   GET  /:provider/connect              → redirect to provider auth
 *   GET  /:provider/callback             → token exchange, store encrypted refresh
 *   GET  /accounts                       → list mailboxes
 *   PATCH  /accounts/:id                 → patch label / status / min-score
 *   DELETE /accounts/:id                 → disconnect
 *   GET  /accounts/:id/access-token      → vend short-lived bearer for PWA sync
 *
 * Sync itself runs in the PWA via `runClientSync`
 * (frontend/lib/email-integration/sync-client.ts) → each chunk lands
 * on `POST /api/inbox/external-emails/ingest`. The old server-side
 * `POST /sync/now` + scheduled.ts cron sweep were removed in the
 * #757 cutover — keeping two sync paths only re-created the original
 * Cloudflare Workers subrequest-budget bug whenever the cron path ran.
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
  refreshAccessToken,
} from "../services/email-integration/oauth.js";
import { requirePro } from "../middleware/auth-gates.js";
import { getSubscription } from "../services/billing/BillingService.js";
import { USER_ROLES } from "../../../shared/user-roles.js";
import { loadConsumed } from "../domains/services-processing/services-processor.js";
import { getEntitlement } from "../domains/services-processing/entitlement-catalog.js";
import { inboxSeatAddonService } from "../services/billing/InboxSeatAddonService.js";

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

/**
 * Inbox Sync entitlement check — shared by `/connect` and `/callback` so
 * the Pro gate + 3-inbox cap can't drift between them. Returns either
 * `{ ok: true }` (user may proceed) or `{ ok: false, redirect }` where
 * `redirect` is the in-app path the browser should land on (an
 * upgrade page when blocked).
 *
 * Admin / SuperAdmin bypass — same posture as `requirePro`.
 *
 * When `skipIfExisting` is supplied (callback path), re-connecting an
 * already-tracked `(provider, email)` is exempt from the cap so users
 * can re-consent without being blocked.
 */
async function checkInboxSyncEntitlement(
  userId: string,
  userRole: string | null | undefined,
  repos: ReturnType<typeof buildRepos>,
  skipIfExisting?: { provider: string; accountEmail: string },
): Promise<{ ok: true } | { ok: false; redirect: string }> {
  if (userRole === USER_ROLES.SUPER_ADMIN || userRole === USER_ROLES.ADMIN) {
    return { ok: true };
  }
  const sub = await getSubscription(userId);
  if (!sub.isPro) {
    return { ok: false, redirect: "/pricing?upgrade=inbox-sync" };
  }
  // Cap = catalog default (INBOX_SYNC_INCLUDED_ACCOUNTS) + any extra
  // inbox-seat addons the user has purchased (#809). Consumed count
  // comes from the same catalog dispatcher `gate()` uses.
  const baseCap = getEntitlement("email_account").monthlyCap.pro;
  const addonState = await inboxSeatAddonService.getState(userId);
  const cap = baseCap + addonState.quantity;
  const consumed = await loadConsumed(userId, "email_account");
  if (consumed < cap) return { ok: true };
  if (skipIfExisting) {
    const existing = await repos.externalEmailAccounts.findByProviderEmail(
      userId,
      skipIfExisting.provider,
      skipIfExisting.accountEmail,
    );
    if (existing) return { ok: true };
  }
  return { ok: false, redirect: "/pricing?upgrade=inbox-extra" };
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
  // Pro gate + 3-inbox cap. Browser navigation can't render a 402 JSON
  // envelope, so on block we bounce to the Pricing page with an upgrade
  // highlight instead. Helper is shared with the /callback path so the
  // two gates can't drift.
  const entitlement = await checkInboxSyncEntitlement(uid, user.role, repos);
  if (entitlement.ok === false) return c.redirect(`${base}${entitlement.redirect}`);
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
  // Belt-and-braces: re-check Pro + cap at callback time so a user who
  // downgraded between /connect and /callback (or completed an older
  // link) can't slip past the gate. Re-connecting an existing mailbox
  // is exempt from the cap.
  const cbUser = await repos.users.findById(state.userId);
  const cbEntitlement = await checkInboxSyncEntitlement(
    state.userId,
    cbUser?.role ?? null,
    repos,
    { provider, accountEmail: mailboxEmail },
  );
  if (cbEntitlement.ok === false) return c.redirect(`${base}${cbEntitlement.redirect}`);
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
  // Per-account confidence floor for the inbox feed. Clamp to [0, 1]
  // so a misconfigured client can't permanently hide every message
  // (>1) or flood the inbox with every newsletter (<0).
  if (typeof body.minJobScore === "number" && Number.isFinite(body.minJobScore)) {
    const clamped = Math.max(0, Math.min(1, body.minJobScore));
    patch.minJobScore = clamped.toFixed(3);
  }
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

/** Vends a short-lived provider access token for the client-driven
 *  PWA sync. The browser uses it to call Gmail/Graph APIs directly
 *  (CORS-enabled) instead of routing every message fetch through the
 *  Worker. The refresh token stays server-side encrypted — only the
 *  ~1h access token crosses the wire. See #755 for the architecture.
 *  Pro-gated — this is the actual sync engine entry point. */
emailIntegrationRoutes.get("/accounts/:id/access-token", requirePro("Inbox Sync"), async (c) => {
  const uid = c.var.user?.sub;
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const repos = buildRepos(getDb());
  const account = await repos.externalEmailAccounts.findById(c.req.param("id"), uid);
  if (!account) return c.json(error("NOT_FOUND", "Account not found"), 404);
  if (!account.oauthRefreshTokenEnc) {
    return c.json(error("NOT_CONNECTED", "Mailbox missing refresh token"), 400);
  }
  try {
    const { accessToken, expiresIn } = await refreshAccessToken(
      account.provider as EmailProviderId,
      account.oauthRefreshTokenEnc,
    );
    return c.json(
      success({
        accessToken,
        expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
        provider: account.provider,
        accountEmail: account.accountEmail,
      }),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Refresh failed";
    // Mark the account as error so the UI can surface a reconnect CTA.
    try {
      await repos.externalEmailAccounts.patch(account.id, uid, {
        status: "error",
        lastError: message.slice(0, 8000),
      } as any);
    } catch {
      // Diagnostic write failure shouldn't mask the underlying refresh error.
    }
    // `invalid_grant` from Google / Microsoft means the stored refresh token
    // is no longer accepted (user revoked, password change, 7-day Testing-app
    // expiry, 6-month inactivity). That's user state, not a server fault, so
    // return 400 with a dedicated code the frontend can silently catch and
    // surface as a "Reconnect this mailbox" affordance instead of a red
    // 502 toast. The account row is already flipped to `status: "error"`
    // above so the inbox surfaces can decide their own visibility.
    if (/invalid_grant/i.test(message)) {
      return c.json(
        error("MAILBOX_REAUTH_REQUIRED", message, {
          accountId: account.id,
          provider: account.provider,
          accountEmail: account.accountEmail,
        }),
        400,
      );
    }
    return c.json(error("REFRESH_FAILED", message), 502);
  }
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

// ── Sync history ─────────────────────────────────────────────────────────────
// Manual sync moved to the PWA — see `runClientSync` in
// frontend/lib/email-integration/sync-client.ts. The chunks land on
// `POST /api/inbox/external-emails/ingest` for persist + classify, and
// one trailing `POST /api/inbox/external-emails/finalize` (gap #826)
// `upsertChunkResult`s one `email_sync_runs` row per logical sync keyed
// on `(account_id, sync_session_id)` (gap #811, migration 0095). Rows
// from before #811 carry `sync_session_id IS NULL` and stay in the
// table as historical audit — they don't aggregate but are still
// surfaced below.

emailIntegrationRoutes.get("/sync-runs", async (c) => {
  const uid = c.var.user?.sub;
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const limit = Math.min(50, Math.max(1, Number(c.req.query("limit") ?? "10") || 10));
  const repos = buildRepos(getDb());
  const [runs, accounts] = await Promise.all([
    repos.emailSyncRuns.findRecentForUser(uid, limit),
    repos.externalEmailAccounts.findAllForUser(uid),
  ]);
  // Join in the account label + provider so the Sync History UI can
  // render without a second round-trip. The raw rows don't carry
  // either field (the join lives at the read site, not the table).
  const accountById = new Map(
    accounts.map((a) => [a.id, { provider: a.provider, label: a.accountLabel?.trim() || a.accountEmail }]),
  );
  return c.json(
    success(
      runs.map((r) => {
        const acct = accountById.get(r.accountId);
        return {
          id: r.id,
          accountId: r.accountId,
          accountLabel: acct?.label ?? null,
          provider: acct?.provider ?? null,
          startedAt:
            r.startedAt instanceof Date ? r.startedAt.toISOString() : new Date(r.startedAt).toISOString(),
          completedAt: r.completedAt
            ? r.completedAt instanceof Date
              ? r.completedAt.toISOString()
              : new Date(r.completedAt).toISOString()
            : null,
          status: r.status,
          messagesSynced: r.messagesSynced ?? 0,
          messagesClassified: r.messagesClassified ?? 0,
          messagesExcluded: r.messagesExcluded ?? 0,
          messagesJobRelated: r.messagesJobRelated ?? 0,
          jobsLinked: r.jobsLinked ?? 0,
          jobsCreated: r.jobsCreated ?? 0,
          rulesFired: (r.rulesFired ?? {}) as Record<string, number>,
          digestSummary: r.digestSummary,
          errorMessage: r.errorMessage,
        };
      }),
    ),
  );
});

