/**
 * /api/inbox — single read-side endpoint for the Communication Hub.
 *
 * Replaces multiple fetches (`/api/communication/conversations`,
 * `/api/notifications`, `/api/users/me/connections/pending`, …) the
 * frontend used to fan out on every poll. One auth check, one
 * rate-limiter hit, one queryset.
 *
 * Per-row mutations live on this router too so the hub keeps a single
 * surface for read + write of inbox state, even when a row's underlying
 * data lives in a non-conversation aggregate (e.g. external email).
 * Use cases: services/email-integration/inbox-emails.ts (every successful
 * external-email write bumps the caller's cached inbox there).
 */

import { Hono } from "hono";
import type { Context } from "hono";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { decodeEmailCursor } from "../services/messaging/inboxService.js";
import {
  finalizeEmailSync,
  getExternalEmail,
  getInbox,
  ingestEmailChunk,
  junkExternalEmail,
  markAllExternalEmailsRead,
  setExternalEmailArchived,
  setExternalEmailRead,
  setExternalEmailsArchived,
} from "../services/email-integration/inbox-emails.js";
import { createLLMClient } from "../services/adapters/llm-client.js";
import type { FindInboxOptions } from "../repositories/externalEmailMessagesRepository.js";
import { requirePro } from "../middleware/auth-gates.js";
import { requireUser } from "./helpers/routerHelpers.js";

export const inboxRoutes = new Hono<AppEnv>();

/** Parse the ?accountIds=a,b,c&unread=1&archived=1&emailCursor=… query
 *  into the options shape the repo + service expect. Centralised here so
 *  both the page-tab and overlay clients get the same semantics. */
function parseEmailFilters(c: Context): FindInboxOptions {
  const url = new URL(c.req.url);
  const accountIdsCsv = url.searchParams.get("accountIds");
  const accountIds = accountIdsCsv
    ? accountIdsCsv
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;
  const unreadOnly = url.searchParams.get("unread") === "1";
  const includeArchived = url.searchParams.get("archived") === "1";
  const junkOnly = url.searchParams.get("junk") === "1";
  const cursor = decodeEmailCursor(url.searchParams.get("emailCursor"));
  return { accountIds, unreadOnly, includeArchived, junkOnly, cursor };
}

inboxRoutes.get("/", async (c) => {
  const uid = requireUser(c);
  return c.json(success(await getInbox(uid, parseEmailFilters(c))), 200);
});

inboxRoutes.get("/external-emails/:id", async (c) => {
  const uid = requireUser(c);
  return c.json(success(await getExternalEmail(uid, c.req.param("id"))), 200);
});

inboxRoutes.post("/external-emails/:id/mark-read", async (c) => {
  const uid = requireUser(c);
  await setExternalEmailRead(uid, c.req.param("id"), true);
  return c.json(success({ success: true }), 200);
});

inboxRoutes.post("/external-emails/:id/mark-unread", async (c) => {
  const uid = requireUser(c);
  await setExternalEmailRead(uid, c.req.param("id"), false);
  return c.json(success({ success: true }), 200);
});

inboxRoutes.post("/external-emails/mark-all-read", async (c) => {
  const uid = requireUser(c);
  await markAllExternalEmailsRead(uid);
  return c.json(success({ success: true }), 200);
});

inboxRoutes.post("/external-emails/:id/archive", async (c) => {
  const uid = requireUser(c);
  const body = await c.req.json().catch(() => ({}));
  const archived = body?.archived !== false; // default true
  await setExternalEmailArchived(uid, c.req.param("id"), archived);
  return c.json(success({ success: true }), 200);
});

/** Mark as Junk — archive the message AND mint a user rule keyed on the
 *  sender (or sender domain) so future syncs auto-archive every match.
 *
 *  Body: `{ matchKind?: 'sender' | 'domain' | 'sender+subject',
 *           matchValue?: string }` — when omitted, defaults to
 *  `sender` keyed off the email's `fromEmail`. The frontend
 *  JunkConfirmDialog forwards the user's edits via these fields. */
inboxRoutes.post("/external-emails/:id/junk", async (c) => {
  const uid = requireUser(c);
  const body = await c.req.json().catch(() => ({}));
  const matchKind: string =
    typeof body?.matchKind === "string" ? body.matchKind : "sender";
  const matchValueOverride: string | null =
    typeof body?.matchValue === "string" && body.matchValue.trim().length > 0
      ? body.matchValue.trim()
      : null;
  const result = await junkExternalEmail(uid, c.req.param("id"), matchKind, matchValueOverride);
  return c.json(success(result), 200);
});

/** Bulk dismiss/restore — the page-tab "Delete selected" action. */
inboxRoutes.post("/external-emails/bulk-archive", async (c) => {
  const uid = requireUser(c);
  const body = await c.req.json().catch(() => ({}));
  const ids = Array.isArray(body?.ids)
    ? body.ids.filter((x: unknown): x is string => typeof x === "string" && x.length > 0)
    : [];
  if (ids.length === 0) {
    return c.json(error("VALIDATION_ERROR", "ids[] is required"), 400);
  }
  if (ids.length > 200) {
    return c.json(error("VALIDATION_ERROR", "ids[] exceeds bulk limit of 200"), 400);
  }
  const archived = body?.archived !== false;
  await setExternalEmailsArchived(uid, ids, archived);
  return c.json(success({ count: ids.length }), 200);
});

// Sync history lives at `/api/integrations/email/sync-runs` —
// shared with the Email Settings panel so the row shape stays in one
// place. The Inbox tab's history sheet calls
// `emailIntegrationService.listSyncRuns()`.

/** Client-driven sync ingest. The browser pulls mail directly from
 *  Gmail/Outlook (via the access-token vending route + CORS) and POSTs
 *  pre-classified chunks here. Each POST is its own Worker invocation
 *  → fresh subrequest budget per chunk, instead of one big sweep
 *  burning the 50/req budget across every account. See #755.
 *
 *  After the final chunk the client calls `/external-emails/finalize`
 *  (below) to advance the provider cursor + write the sync-run audit
 *  row + meter the logical sync. Splitting those writes out of the
 *  ingest path keeps the per-chunk subrequest budget free for
 *  persistence + LLM (gap #826). */
inboxRoutes.post("/external-emails/ingest", requirePro("Inbox Sync"), async (c) => {
  const uid = requireUser(c);
  const body = await c.req.json().catch(() => ({}));
  if (!body?.accountId || typeof body.accountId !== "string") {
    return c.json(error("VALIDATION_ERROR", "accountId required"), 400);
  }
  if (!Array.isArray(body.messages)) {
    return c.json(error("VALIDATION_ERROR", "messages[] required"), 400);
  }
  if (body.messages.length === 0) {
    return c.json(error("VALIDATION_ERROR", "messages[] must not be empty"), 400);
  }
  if (body.messages.length > 25) {
    return c.json(
      error("VALIDATION_ERROR", "messages[] exceeds chunk limit of 25"),
      400,
    );
  }
  const llm = createLLMClient(c.env, c.var.user);
  // A failed ingest is a 400 INGEST_FAILED DomainError carrying the db cause.
  const result = await ingestEmailChunk(llm, uid, { accountId: body.accountId, messages: body.messages });
  return c.json(success(result), 200);
});

/** Trailing call for a client-driven logical sync — writes the
 *  `email_sync_runs` audit row (gap #811), advances the provider
 *  cursor (gap #727), and meters one `email_sync` event for the whole
 *  sync (gap #812). Lives on its own route so the writes don't compete
 *  for budget with the per-chunk LLM fan-out — see gap #826. */
inboxRoutes.post("/external-emails/finalize", requirePro("Inbox Sync"), async (c) => {
  const uid = requireUser(c);
  const body = await c.req.json().catch(() => ({}));
  if (!body?.accountId || typeof body.accountId !== "string") {
    return c.json(error("VALIDATION_ERROR", "accountId required"), 400);
  }
  if (!body?.syncSessionId || typeof body.syncSessionId !== "string") {
    return c.json(error("VALIDATION_ERROR", "syncSessionId required"), 400);
  }
  const agg = body.aggregate;
  if (!agg || typeof agg !== "object") {
    return c.json(error("VALIDATION_ERROR", "aggregate required"), 400);
  }
  // A failed finalize is a 400 FINALIZE_FAILED DomainError carrying the db cause.
  const result = await finalizeEmailSync(uid, {
    accountId: body.accountId,
    syncSessionId: body.syncSessionId,
    nextCursor: typeof body.nextCursor === "string" ? body.nextCursor : null,
    aggregate: agg,
  });
  return c.json(success(result), 200);
});
