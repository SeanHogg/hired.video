/**
 * Connected mailboxes (the /api/integrations/email account routes): the
 * OAuth connect/callback flow with its Pro + inbox-cap gate, account
 * list/patch/remove, short-lived access-token vending for the PWA sync, and
 * the sync-run history.
 *
 * Browser-navigation steps (connect, callback) answer with an in-app
 * redirect PATH; the route prefixes the frontend origin.
 */
import { jwtVerify } from "jose";
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { buildRepos, type Repos } from "../../repositories/index.js";
import { USER_ROLES } from "../../../../shared/user-roles.js";
import { pricingUpgradeUrl } from "../../../../shared/upgrade-slugs.js";
import { loadConsumed } from "../../domains/services-processing/services-processor.js";
import { getEntitlement } from "../../domains/services-processing/entitlement-catalog.js";
import { getSubscription } from "../billing/BillingService.js";
import { inboxSeatAddonService } from "../billing/InboxSeatAddonService.js";
import { getJwtSecretOptional } from "../../utils/jwt.js";
import { apiBaseUrl } from "../../utils/public-urls.js";
import { logger } from "../../lib/logger.js";
import {
  EMAIL_PROVIDER_CONFIG,
  type EmailProviderId,
  createState,
  verifyState,
  exchangeCode,
  encryptToken,
  refreshAccessToken,
  RefreshAccessTokenError,
} from "./oauth.js";

function repos(): Repos {
  return buildRepos(getDb());
}

const SETTINGS_PATH = "/settings?tab=email";
const LOGIN_PATH = `/login?redirect=${encodeURIComponent(SETTINGS_PATH)}`;

function callbackUrl(provider: string): string {
  return `${apiBaseUrl()}/api/integrations/email/${provider}/callback`;
}

/** Top-level browser navigation can't carry an Authorization header — the
 *  /connect route is in the public allowlist (app.ts EMAIL_OAUTH_PUBLIC_ROUTE)
 *  and authenticates the caller via a short-lived `link_token` JWT. */
async function userIdFromLinkToken(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  // Optional on purpose: an unconfigured secret means "cannot authenticate
  // this link", not a crash — see utils/jwt.ts for the throwing variant.
  const secret = getJwtSecretOptional();
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

/** An in-app redirect path — must start with `/` and not `//` or `/\`
 *  (scheme-relative to another host). Closes the open-redirect class (#540). */
function safeRedirect(raw: string | undefined, fallback: string): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  return raw;
}

/**
 * Inbox Sync entitlement — shared by connect + callback so the Pro gate and
 * the inbox cap can't drift. Admin / SuperAdmin bypass (same as requirePro).
 * `skipIfExisting` (callback) exempts re-connecting an already-tracked
 * `(provider, email)` from the cap so users can re-consent.
 */
async function checkInboxSyncEntitlement(
  r: Repos,
  userId: string,
  userRole: string | null | undefined,
  skipIfExisting?: { provider: string; accountEmail: string },
): Promise<{ ok: true } | { ok: false; redirect: string }> {
  if (userRole === USER_ROLES.SUPER_ADMIN || userRole === USER_ROLES.ADMIN) {
    return { ok: true };
  }
  const sub = await getSubscription(userId);
  if (!sub.isPro) {
    return { ok: false, redirect: pricingUpgradeUrl("inbox-sync") };
  }
  // Cap = catalog default + purchased inbox-seat addons (#809); consumed
  // count comes from the same catalog dispatcher `gate()` uses.
  const baseCap = getEntitlement("email_account").monthlyCap.pro;
  const addonState = await inboxSeatAddonService.getState(userId);
  const cap = baseCap + addonState.quantity;
  const consumed = await loadConsumed(userId, "email_account");
  if (consumed < cap) return { ok: true };
  if (skipIfExisting) {
    const existing = await r.externalEmailAccounts.findByProviderEmail(
      userId,
      skipIfExisting.provider,
      skipIfExisting.accountEmail,
    );
    if (existing) return { ok: true };
  }
  return { ok: false, redirect: pricingUpgradeUrl("inbox-extra") };
}

// ── Connect / callback ───────────────────────────────────────────────────────

export type ConnectStart =
  | { kind: "redirect"; path: string }
  | { kind: "authorize"; url: string };

/**
 * GET /:provider/connect. Unauthenticated / unverified / not-entitled callers
 * get an in-app redirect path (login, verify-email, pricing upgrade); an
 * eligible caller gets the provider's authorize URL. Unknown provider → 404,
 * unconfigured provider → 503.
 */
export async function startMailboxConnect(input: {
  provider: string;
  linkToken: string | undefined;
  redirect: string | undefined;
  reconnectAccountEmail: string | undefined;
}): Promise<ConnectStart> {
  const uid = await userIdFromLinkToken(input.linkToken);
  if (!uid) return { kind: "redirect", path: LOGIN_PATH };
  // Per-route email-verify gate (the global middleware would 403 a browser
  // navigation, a dead end) — surface the verification flow instead.
  const r = repos();
  const user = await r.users.findById(uid);
  if (!user) return { kind: "redirect", path: LOGIN_PATH };
  if (!user.emailVerified) {
    return { kind: "redirect", path: `/verify-email?redirect=${encodeURIComponent(SETTINGS_PATH)}` };
  }
  const entitlement = await checkInboxSyncEntitlement(r, uid, user.role);
  if (entitlement.ok === false) return { kind: "redirect", path: entitlement.redirect };

  const provider = input.provider.toLowerCase() as EmailProviderId;
  const cfg = EMAIL_PROVIDER_CONFIG[provider];
  if (!cfg) throw new DomainError(404, "NOT_FOUND", `Unknown provider: ${provider}`);
  if (!cfg.clientId() || !cfg.clientSecret()) {
    throw new DomainError(503, "SERVICE_UNAVAILABLE", `${provider} integration not configured`);
  }
  // #916 — a Reconnect pins the expected mailbox in the state JWT (the
  // callback rejects a mismatch) and as `login_hint` for the account picker.
  const reconnectAccountEmail = input.reconnectAccountEmail?.trim() || undefined;
  const state = await createState({
    userId: uid,
    ts: Date.now(),
    nonce: crypto.randomUUID(),
    redirect: safeRedirect(input.redirect, SETTINGS_PATH),
    reconnectAccountEmail,
  });
  const params = new URLSearchParams({
    client_id: cfg.clientId(),
    redirect_uri: callbackUrl(provider),
    response_type: "code",
    scope: cfg.scopes.join(" "),
    state,
    ...cfg.authParams,
    ...(reconnectAccountEmail ? { login_hint: reconnectAccountEmail } : {}),
  });
  return { kind: "authorize", url: `${cfg.authUrl}?${params.toString()}` };
}

/** GET /:provider/callback — exchange the code, re-check the entitlement,
 *  store the encrypted refresh token. Always answers an in-app redirect path. */
export async function completeMailboxConnect(input: {
  provider: string;
  code: string | undefined;
  state: string | undefined;
}): Promise<string> {
  const provider = input.provider.toLowerCase() as EmailProviderId;
  const cfg = EMAIL_PROVIDER_CONFIG[provider];
  if (!cfg) return `${SETTINGS_PATH}&error=unknown_provider`;
  if (!input.code || !input.state) return `${SETTINGS_PATH}&error=missing_params`;
  const state = await verifyState(input.state);
  if (!state) return `${SETTINGS_PATH}&error=invalid_state`;

  let tokens: Awaited<ReturnType<typeof exchangeCode>>;
  let mailboxEmail: string;
  try {
    tokens = await exchangeCode(provider, input.code, callbackUrl(provider));
    mailboxEmail = await cfg.fetchAccountEmail(tokens.access_token);
  } catch (err) {
    logger.error(`[email-integration:${provider}] callback failed`, err);
    return `${SETTINGS_PATH}&error=auth_failed`;
  }
  // Without a refresh token we can't sync — bounce so the user re-consents
  // (Google sometimes skips refresh on repeat consent).
  if (!tokens.refresh_token) return `${SETTINGS_PATH}&error=no_refresh_token`;

  // #916 — a pinned Reconnect must consent the SAME mailbox, otherwise we'd
  // create a duplicate row and leave the broken one in `status: "error"`.
  if (
    state.reconnectAccountEmail &&
    state.reconnectAccountEmail.toLowerCase() !== mailboxEmail.toLowerCase()
  ) {
    return `${SETTINGS_PATH}&error=reconnect_account_mismatch&expected=${encodeURIComponent(state.reconnectAccountEmail)}&picked=${encodeURIComponent(mailboxEmail)}`;
  }

  // Belt-and-braces: re-check Pro + cap so a user who downgraded between
  // connect and callback can't slip past. Re-connecting is cap-exempt.
  const r = repos();
  const cbUser = await r.users.findById(state.userId);
  const entitlement = await checkInboxSyncEntitlement(r, state.userId, cbUser?.role ?? null, {
    provider,
    accountEmail: mailboxEmail,
  });
  if (entitlement.ok === false) return entitlement.redirect;

  await r.externalEmailAccounts.upsert({
    userId: state.userId,
    provider,
    accountEmail: mailboxEmail,
    accountLabel: mailboxEmail,
    oauthRefreshTokenEnc: await encryptToken(tokens.refresh_token),
    scopes: tokens.scope?.split(" ") ?? cfg.scopes,
    status: "active",
    lastError: null,
  } as any);
  return `${state.redirect}${state.redirect.includes("?") ? "&" : "?"}connected=${provider}`;
}

// ── Account management ───────────────────────────────────────────────────────

export async function listMailboxAccounts(userId: string) {
  const accounts = await repos().externalEmailAccounts.findAllForUser(userId);
  return accounts.map((a) => ({
    id: a.id,
    provider: a.provider,
    accountEmail: a.accountEmail,
    accountLabel: a.accountLabel,
    status: a.status,
    lastSyncedAt: a.lastSyncedAt?.toISOString() ?? null,
    lastError: a.lastError,
  }));
}

/** Patch label / status / relevance floor / active inbox profile. */
export async function patchMailboxAccount(userId: string, id: string, body: Record<string, any>): Promise<void> {
  const r = repos();
  const patch: Record<string, unknown> = {};
  if (typeof body.accountLabel === "string") patch.accountLabel = body.accountLabel.slice(0, 120);
  if (body.status === "active" || body.status === "paused") patch.status = body.status;
  // Per-account confidence floor, clamped to [0, 1] so a bad client can't
  // hide everything (>1) or flood the inbox (<0). Legacy `minJobScore` key
  // still accepted for stale client builds.
  const rawScore =
    typeof body.minRelevanceScore === "number"
      ? body.minRelevanceScore
      : typeof body.minJobScore === "number"
        ? body.minJobScore
        : undefined;
  if (typeof rawScore === "number" && Number.isFinite(rawScore)) {
    patch.minRelevanceScore = Math.max(0, Math.min(1, rawScore)).toFixed(3);
  }
  // Active inbox profile (#1984) — only a preset or the caller's own clone.
  if (body.activeProfileId === null) {
    // Reset to the default (Job Hunter) — the resolver falls back when null.
    patch.activeProfileId = null;
  } else if (typeof body.activeProfileId === "string" && body.activeProfileId) {
    const candidate = await r.inboxProfiles.findById(body.activeProfileId);
    if (!candidate || !(candidate.isPreset || candidate.ownerId === userId)) {
      throw new DomainError(400, "VALIDATION_ERROR", "Unknown or unauthorized profile");
    }
    patch.activeProfileId = body.activeProfileId;
  }
  if (Object.keys(patch).length === 0) {
    throw new DomainError(400, "VALIDATION_ERROR", "No supported fields in patch");
  }
  await r.externalEmailAccounts.patch(id, userId, patch as any);
}

export async function removeMailboxAccount(userId: string, id: string): Promise<void> {
  await repos().externalEmailAccounts.remove(id, userId);
}

/** Vend a ~1h provider access token for the client-driven PWA sync (#755);
 *  the refresh token never leaves the server. A failed refresh marks the
 *  account `error` (UI reconnect CTA) and answers MAILBOX_REAUTH_REQUIRED
 *  (400) for a re-consent failure (#918), else REFRESH_FAILED (502). */
export async function vendMailboxAccessToken(userId: string, id: string) {
  const accounts = repos().externalEmailAccounts;
  const account = await accounts.findById(id, userId);
  if (!account) throw new DomainError(404, "NOT_FOUND", "Account not found");
  if (!account.oauthRefreshTokenEnc) {
    throw new DomainError(400, "NOT_CONNECTED", "Mailbox missing refresh token");
  }
  try {
    const { accessToken, expiresIn } = await refreshAccessToken(
      account.provider as EmailProviderId,
      account.oauthRefreshTokenEnc,
      (resealed) => accounts.patch(account.id, userId, { oauthRefreshTokenEnc: resealed }),
    );
    return {
      accessToken,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
      provider: account.provider,
      accountEmail: account.accountEmail,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Refresh failed";
    try {
      await accounts.patch(account.id, userId, { status: "error", lastError: message.slice(0, 8000) } as any);
    } catch {
      // Diagnostic write failure shouldn't mask the underlying refresh error.
    }
    // Branch on the typed RefreshFailure.kind (Graph's AADSTS70000 /
    // interaction_required / consent_required map to "reauth" too).
    const isReauth =
      err instanceof RefreshAccessTokenError ? err.failure.kind === "reauth" : /invalid_grant/i.test(message);
    if (isReauth) {
      throw new DomainError(400, "MAILBOX_REAUTH_REQUIRED", message, {
        accountId: account.id,
        provider: account.provider,
        accountEmail: account.accountEmail,
        failureCode: err instanceof RefreshAccessTokenError ? err.failure.code : null,
      });
    }
    throw new DomainError(502, "REFRESH_FAILED", message);
  }
}

// ── Sync history ─────────────────────────────────────────────────────────────

const iso = (d: Date | string) => (d instanceof Date ? d.toISOString() : new Date(d).toISOString());

/** Recent `email_sync_runs` with the account label + provider joined in. */
export async function listSyncRuns(userId: string, limit: number) {
  const r = repos();
  const [runs, accounts] = await Promise.all([
    r.emailSyncRuns.findRecentForUser(userId, limit),
    r.externalEmailAccounts.findAllForUser(userId),
  ]);
  const accountById = new Map(
    accounts.map((a) => [a.id, { provider: a.provider, label: a.accountLabel?.trim() || a.accountEmail }]),
  );
  return runs.map((run) => {
    const acct = accountById.get(run.accountId);
    return {
      id: run.id,
      accountId: run.accountId,
      accountLabel: acct?.label ?? null,
      provider: acct?.provider ?? null,
      startedAt: iso(run.startedAt),
      completedAt: run.completedAt ? iso(run.completedAt) : null,
      status: run.status,
      messagesSynced: run.messagesSynced ?? 0,
      messagesClassified: run.messagesClassified ?? 0,
      messagesExcluded: run.messagesExcluded ?? 0,
      messagesJobRelated: run.messagesJobRelated ?? 0,
      jobsLinked: run.jobsLinked ?? 0,
      jobsCreated: run.jobsCreated ?? 0,
      rulesFired: (run.rulesFired ?? {}) as Record<string, number>,
      digestSummary: run.digestSummary,
      errorMessage: run.errorMessage,
    };
  });
}
