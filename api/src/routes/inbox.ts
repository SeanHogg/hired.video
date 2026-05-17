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
 */

import { Hono } from "hono";
import type { Variables } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb } from "../db/index.js";
import { buildRepos } from "../repositories/index.js";
import { getInboxFor } from "../services/messaging/inboxService.js";
import { ingestForAccount } from "../services/email-integration/ingest.js";
import { createLLMClient } from "../services/adapters/llm-client.js";
import type { FindInboxOptions } from "../repositories/externalEmailMessagesRepository.js";

export const inboxRoutes = new Hono<{ Variables: Variables }>();

/** Parse the ?accountIds=a,b,c&unread=1&archived=1 query into the
 *  options shape the repo + service expect. Centralised here so both
 *  the page-tab and overlay clients get the same semantics. */
function parseEmailFilters(c: any): FindInboxOptions {
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
  return { accountIds, unreadOnly, includeArchived };
}

inboxRoutes.get("/", async (c) => {
  const uid = c.var.user?.sub;
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const repos = buildRepos(getDb());
  const inbox = await getInboxFor({ repos }, uid, parseEmailFilters(c));
  return c.json(success(inbox), 200);
});

inboxRoutes.get("/external-emails/:id", async (c) => {
  const uid = c.var.user?.sub;
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const repos = buildRepos(getDb());
  const row = await repos.externalEmailMessages.findByIdWithAccount(
    c.req.param("id"),
    uid,
  );
  if (!row) return c.json(error("NOT_FOUND", "Email not found"), 404);
  return c.json(
    success({
      id: row.id,
      provider: row.provider,
      accountId: row.accountId,
      accountLabel: row.accountLabel?.trim() || row.accountEmail,
      accountEmail: row.accountEmail,
      fromEmail: row.fromEmail,
      fromName: row.fromName,
      subject: row.subject,
      snippet: row.snippet,
      bodyText: row.bodyText,
      bodyHtml: row.bodyHtml,
      category: row.category,
      score: row.score == null ? null : Number(row.score),
      summary: row.summary,
      linkedJobId: row.linkedJobId,
      applyUrl: row.applyUrl,
      isRead: row.isRead,
      isArchived: row.isArchived,
      receivedAt:
        row.receivedAt instanceof Date
          ? row.receivedAt.toISOString()
          : new Date(row.receivedAt).toISOString(),
      providerMessageId: row.providerMessageId,
      providerThreadId: row.providerThreadId,
    }),
    200,
  );
});

inboxRoutes.post("/external-emails/:id/mark-read", async (c) => {
  const uid = c.var.user?.sub;
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const repos = buildRepos(getDb());
  await repos.externalEmailMessages.markRead(c.req.param("id"), uid);
  return c.json(success({ success: true }), 200);
});

inboxRoutes.post("/external-emails/:id/mark-unread", async (c) => {
  const uid = c.var.user?.sub;
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const repos = buildRepos(getDb());
  await repos.externalEmailMessages.markUnread(c.req.param("id"), uid);
  return c.json(success({ success: true }), 200);
});

inboxRoutes.post("/external-emails/mark-all-read", async (c) => {
  const uid = c.var.user?.sub;
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const repos = buildRepos(getDb());
  await repos.externalEmailMessages.markAllReadForUser(uid);
  return c.json(success({ success: true }), 200);
});

inboxRoutes.post("/external-emails/:id/archive", async (c) => {
  const uid = c.var.user?.sub;
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const body = await c.req.json().catch(() => ({}));
  const archived = body?.archived !== false; // default true
  const repos = buildRepos(getDb());
  await repos.externalEmailMessages.setArchived(c.req.param("id"), uid, archived);
  return c.json(success({ success: true }), 200);
});

/** Bulk dismiss/restore — the page-tab "Delete selected" action. The
 *  per-account+providerMessageId unique key on the messages table
 *  means re-sync will not reinsert rows once archived; this is the
 *  "remove from inbox, don't pull again" behaviour the user asked for. */
inboxRoutes.post("/external-emails/bulk-archive", async (c) => {
  const uid = c.var.user?.sub;
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
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
  const repos = buildRepos(getDb());
  await repos.externalEmailMessages.setArchivedBulk(ids, uid, archived);
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
 *  burning the 50/req budget across every account. See #755. */
inboxRoutes.post("/external-emails/ingest", async (c) => {
  const uid = c.var.user?.sub;
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
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
  const repos = buildRepos(getDb());
  const llm = createLLMClient(c.env, c.var.user);
  try {
    const result = await ingestForAccount(
      { repos, llm },
      uid,
      {
        accountId: body.accountId,
        messages: body.messages,
        nextCursor: typeof body.nextCursor === "string" ? body.nextCursor : null,
      },
    );
    return c.json(success(result), 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ingest failed";
    return c.json(error("INGEST_FAILED", message), 400);
  }
});
