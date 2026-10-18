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
 *
 * Use cases: services/email-integration/mailbox-accounts.ts (accounts,
 * OAuth, sync history) and inbox-processor-config.ts (rules, profiles,
 * actions). Failures are DomainErrors rendered by the global handler.
 */

import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { success } from "../types/index.js";
import { requirePro } from "../middleware/auth-gates.js";
import { createLLMClient } from "../services/adapters/llm-client.js";
import {
  completeMailboxConnect,
  listMailboxAccounts,
  listSyncRuns,
  patchMailboxAccount,
  removeMailboxAccount,
  startMailboxConnect,
  vendMailboxAccessToken,
} from "../services/email-integration/mailbox-accounts.js";
import {
  cloneInboxProfile,
  createEmailRule,
  createProfileAction,
  dryRunInboxProfile,
  getInboxProfile,
  listActionRuns,
  listEmailRules,
  listInboxProfiles,
  listProfileActions,
  patchEmailRule,
  patchInboxProfile,
  patchProfileAction,
  removeEmailRule,
  removeInboxProfile,
  removeProfileAction,
} from "../services/email-integration/inbox-processor-config.js";
import { frontendBaseUrl } from "../utils/public-urls.js";
import { clampLimit } from "../utils/pagination.js";
import { requireUser } from "./helpers/routerHelpers.js";

export const emailIntegrationRoutes = new Hono<AppEnv>();

// ── Connect / callback ───────────────────────────────────────────────────────

/** Browser navigation (authenticated by `?link_token=`, see the service):
 *  login / verify-email / pricing-upgrade redirects when blocked, else the
 *  provider's authorize URL. A JSON 404/503 for an unknown/unconfigured
 *  provider. */
emailIntegrationRoutes.get("/:provider/connect", async (c) => {
  const start = await startMailboxConnect({
    provider: c.req.param("provider"),
    linkToken: c.req.query("link_token"),
    redirect: c.req.query("redirect"),
    reconnectAccountEmail: c.req.query("reconnectAccountEmail"),
  });
  return c.redirect(start.kind === "authorize" ? start.url : `${frontendBaseUrl()}${start.path}`);
});

emailIntegrationRoutes.get("/:provider/callback", async (c) => {
  const path = await completeMailboxConnect({
    provider: c.req.param("provider"),
    code: c.req.query("code"),
    state: c.req.query("state"),
  });
  return c.redirect(`${frontendBaseUrl()}${path}`);
});

// ── Account management ───────────────────────────────────────────────────────

emailIntegrationRoutes.get("/accounts", async (c) => {
  const uid = requireUser(c);
  return c.json(success(await listMailboxAccounts(uid)));
});

emailIntegrationRoutes.patch("/accounts/:id", async (c) => {
  const uid = requireUser(c);
  const body = await c.req.json().catch(() => ({}));
  await patchMailboxAccount(uid, c.req.param("id"), body);
  return c.json(success({ success: true }));
});

emailIntegrationRoutes.delete("/accounts/:id", async (c) => {
  const uid = requireUser(c);
  await removeMailboxAccount(uid, c.req.param("id"));
  return c.json(success({ success: true }));
});

/** Vends a short-lived provider access token for the client-driven
 *  PWA sync (#755). Pro-gated — this is the actual sync engine entry point. */
emailIntegrationRoutes.get("/accounts/:id/access-token", requirePro("Inbox Sync"), async (c) => {
  const uid = requireUser(c);
  return c.json(success(await vendMailboxAccessToken(uid, c.req.param("id"))));
});

// ── Rules CRUD ───────────────────────────────────────────────────────────────

emailIntegrationRoutes.get("/rules", async (c) => {
  const uid = requireUser(c);
  return c.json(success(await listEmailRules(uid, c.req.query("profileId"))));
});

emailIntegrationRoutes.post("/rules", async (c) => {
  const uid = requireUser(c);
  const body = await c.req.json().catch(() => null);
  return c.json(success(await createEmailRule(uid, body)), 201);
});

emailIntegrationRoutes.patch("/rules/:id", async (c) => {
  const uid = requireUser(c);
  const body = await c.req.json().catch(() => ({}));
  await patchEmailRule(uid, c.req.param("id"), body);
  return c.json(success({ success: true }));
});

emailIntegrationRoutes.delete("/rules/:id", async (c) => {
  const uid = requireUser(c);
  await removeEmailRule(uid, c.req.param("id"));
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
  const uid = requireUser(c);
  const limit = clampLimit(c.req.query("limit"), 10, 50);
  return c.json(success(await listSyncRuns(uid, limit)));
});

// ── Inbox processors — profiles (#1979/#1983) ────────────────────────────────
// The role-keyed classifier aggregate. Presets are shared (read-only);
// users clone + edit owner-scoped copies. The builder UI reads/writes here.

emailIntegrationRoutes.get("/profiles", async (c) => {
  const uid = requireUser(c);
  return c.json(success(await listInboxProfiles(uid)));
});

emailIntegrationRoutes.get("/profiles/:id", async (c) => {
  const uid = requireUser(c);
  return c.json(success(await getInboxProfile(uid, c.req.param("id"))));
});

/** Clone a profile (preset or own) into an editable copy. */
emailIntegrationRoutes.post("/profiles", async (c) => {
  const uid = requireUser(c);
  const body = await c.req.json().catch(() => null);
  return c.json(success(await cloneInboxProfile(uid, body)), 201);
});

emailIntegrationRoutes.patch("/profiles/:id", async (c) => {
  const uid = requireUser(c);
  const body = await c.req.json().catch(() => ({}));
  return c.json(success(await patchInboxProfile(uid, c.req.param("id"), body)));
});

emailIntegrationRoutes.delete("/profiles/:id", async (c) => {
  const uid = requireUser(c);
  await removeInboxProfile(uid, c.req.param("id"));
  return c.json(success({ success: true }));
});

/** Dry-run preview — classify a sample of the last N synced messages
 *  under this profile WITHOUT persisting (guards a bad prompt). */
emailIntegrationRoutes.post("/profiles/:id/dry-run", requirePro("Inbox Sync"), async (c) => {
  const uid = requireUser(c);
  const body = await c.req.json().catch(() => ({}));
  const llm = createLLMClient(c.env, c.var.user);
  return c.json(success(await dryRunInboxProfile(llm, uid, c.req.param("id"), body)));
});

// ── Inbox processors — actions (#1981) ───────────────────────────────────────

emailIntegrationRoutes.get("/profiles/:id/actions", async (c) => {
  const uid = requireUser(c);
  return c.json(success(await listProfileActions(uid, c.req.param("id"))));
});

emailIntegrationRoutes.post("/profiles/:id/actions", async (c) => {
  const uid = requireUser(c);
  const body = await c.req.json().catch(() => null);
  return c.json(success(await createProfileAction(uid, c.req.param("id"), body)), 201);
});

emailIntegrationRoutes.patch("/actions/:id", async (c) => {
  const uid = requireUser(c);
  const body = await c.req.json().catch(() => ({}));
  return c.json(success(await patchProfileAction(uid, c.req.param("id"), body)));
});

emailIntegrationRoutes.delete("/actions/:id", async (c) => {
  const uid = requireUser(c);
  await removeProfileAction(uid, c.req.param("id"));
  return c.json(success({ success: true }));
});

// ── Inbox processors — action run audit (#1981 Sync-History surfacing) ───────

emailIntegrationRoutes.get("/action-runs", async (c) => {
  const uid = requireUser(c);
  const limit = clampLimit(c.req.query("limit"), 25, 100);
  return c.json(success(await listActionRuns(uid, limit)));
});
