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
import { describeDbError } from "../db/errors.js";
import { buildRepos } from "../repositories/index.js";
import { getInboxFor } from "../services/messaging/inboxService.js";
import { ingestForAccount } from "../services/email-integration/ingest.js";
import { createLLMClient } from "../services/adapters/llm-client.js";
import type { FindInboxOptions } from "../repositories/externalEmailMessagesRepository.js";
import { requirePro } from "../middleware/auth-gates.js";
import { servicesProcessor } from "../domains/services-processing/services-processor.js";

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
  const junkOnly = url.searchParams.get("junk") === "1";
  return { accountIds, unreadOnly, includeArchived, junkOnly };
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
      applyUrls: (row as any).applyUrls ?? null,
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

/** Mark as Junk — archive the message AND mint a user rule keyed on
 *  the sender (or sender domain) so future syncs auto-archive every
 *  message that matches. The classifier honours user rules ahead of
 *  defaults, so a Stage-1 hit short-circuits LLM + dedup + auto-create
 *  on ingest (`services/email-integration/ingest.ts`).
 *
 *  Body: `{ matchKind?: 'sender' | 'domain' | 'sender+subject',
 *           matchValue?: string }` — when omitted, defaults to
 *  `sender` keyed off the email's `fromEmail`. The frontend
 *  JunkConfirmDialog forwards the user's edits via these fields. */
inboxRoutes.post("/external-emails/:id/junk", async (c) => {
  const uid = c.var.user?.sub;
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const body = await c.req.json().catch(() => ({}));
  const matchKind: string =
    typeof body?.matchKind === "string" ? body.matchKind : "sender";
  const matchValueOverride: string | null =
    typeof body?.matchValue === "string" && body.matchValue.trim().length > 0
      ? body.matchValue.trim()
      : null;

  const repos = buildRepos(getDb());
  const row = await repos.externalEmailMessages.findByIdWithAccount(
    c.req.param("id"),
    uid,
  );
  if (!row) return c.json(error("NOT_FOUND", "Email not found"), 404);

  // Build the rule conditions from the user's chosen match shape.
  const fromEmail = (row.fromEmail || "").toLowerCase().trim();
  const atIdx = fromEmail.indexOf("@");
  const fromDomain = atIdx >= 0 ? fromEmail.slice(atIdx + 1) : fromEmail;
  let conditions: Array<{ field: string; op: string; value: string }>;
  let ruleName: string;
  switch (matchKind) {
    case "domain":
      conditions = [
        {
          field: "from_domain",
          op: "equals",
          value: matchValueOverride ?? fromDomain,
        },
      ];
      ruleName = `Junk: domain ${matchValueOverride ?? fromDomain}`;
      break;
    case "sender+subject":
      conditions = [
        { field: "from_email", op: "equals", value: fromEmail },
        {
          field: "subject",
          op: "contains",
          value: matchValueOverride ?? (row.subject || "").trim(),
        },
      ];
      ruleName = `Junk: ${fromEmail} · "${matchValueOverride ?? row.subject ?? ""}"`;
      break;
    case "sender":
    default:
      conditions = [
        {
          field: "from_email",
          op: "equals",
          value: matchValueOverride ?? fromEmail,
        },
      ];
      ruleName = `Junk: ${matchValueOverride ?? fromEmail}`;
      break;
  }

  // Idempotent — re-junking the same sender just bumps the existing
  // rule back to enabled. Avoids the rule list growing unboundedly
  // every time the user re-junks a thread that already had a match.
  const existing = await repos.emailUserRules.findAllForUser(uid);
  const existingMatch = existing.find((r) => r.name === ruleName);
  let ruleId: string;
  if (existingMatch) {
    if (!existingMatch.isEnabled) {
      await repos.emailUserRules.patch(existingMatch.id, uid, {
        isEnabled: true,
      } as any);
    }
    ruleId = existingMatch.id;
  } else {
    const created = await repos.emailUserRules.insert({
      userId: uid,
      name: ruleName,
      conditions: conditions as any,
      actionCategory: "spam",
      actionScore: "1.000" as any,
      isEnabled: true,
      // Junk rules run BEFORE every default rule so a junked LinkedIn
      // newsletter never gets caught by the linkedin.com ATS rule
      // and reclassified as application_status.
      priority: 10,
    } as any);
    ruleId = created.id;
  }

  // Archive this row so it disappears from the current view too —
  // the rule only governs future ingests.
  await repos.externalEmailMessages.setArchived(row.id, uid, true);
  // Also retag this row's category to 'spam' so the new "Junk" filter
  // surfaces it alongside future matches (it might have come in as
  // application_status / newsletter / other).
  await repos.externalEmailMessages.patch(row.id, {
    category: "spam",
  } as any);

  return c.json(success({ ruleId, ruleName, conditions }), 200);
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
inboxRoutes.post("/external-emails/ingest", requirePro("Inbox Sync"), async (c) => {
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
        // Client-generated UUID stamped on every chunk POST of a single
        // logical sync; the ingest service aggregates per-chunk counters
        // into one `email_sync_runs` row on this key (gap #811).
        syncSessionId:
          typeof body.syncSessionId === "string" && body.syncSessionId.length > 0
            ? body.syncSessionId
            : null,
      },
    );
    // Meter one `email_sync` event per ingest chunk so the Usage
    // Statement surfaces the user's mailbox-sync activity. Best-effort —
    // ledger write failure must not poison the ingest result the client
    // is about to advance its cursor against.
    try {
      await servicesProcessor.meter({
        userId: uid,
        eventType: "email_sync",
        quantity: 1,
        metadata: {
          accountId: body.accountId,
          messagesIngested: result.messagesIngested,
        },
      });
    } catch (meterErr) {
      console.error("[email-ingest] meter failed:", meterErr);
    }
    return c.json(success(result), 200);
  } catch (err) {
    // Walk the Drizzle/Neon cause chain so the client sees an
    // actionable SQLSTATE + detail instead of "Failed query: ..." —
    // see db/errors.ts and gap #727.
    console.error("[email-ingest] route failed:", err);
    return c.json(error("INGEST_FAILED", describeDbError(err)), 400);
  }
});
