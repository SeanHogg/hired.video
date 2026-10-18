/**
 * External-email inbox use cases (the /api/inbox routes): the Communication
 * Hub read, per-message read/archive/junk mutations, and the client-driven
 * sync ingest + finalize.
 *
 * Every successful external-email write changes the caller's cached inbox
 * aggregate (services/messaging/inboxCache.ts), so each mutation here bumps
 * the caller's inbox cache version once it lands.
 */
import { getDb } from "../../db/index.js";
import { describeDbError } from "../../db/errors.js";
import { DomainError } from "../../domains/errors.js";
import { buildRepos, type Repos } from "../../repositories/index.js";
import type { FindInboxOptions } from "../../repositories/externalEmailMessagesRepository.js";
import { servicesProcessor } from "../../domains/services-processing/services-processor.js";
import type { LLMClient } from "../adapters/llm-client.js";
import { getCachedInbox } from "../messaging/inboxCache.js";
import { bumpInboxFor } from "../messaging/inboxCacheVersion.js";
import type { InboxResponse } from "../messaging/inboxService.js";
import { extractJobLinks } from "./dedup.js";
import {
  finalizeSyncSession,
  ingestForAccount,
  type FinalizeResult,
  type IngestRequestMessage,
  type IngestResult,
} from "./ingest.js";

function repos(): Repos {
  return buildRepos(getDb());
}

const emailNotFound = () => new DomainError(404, "NOT_FOUND", "Email not found");

// ── Reads ────────────────────────────────────────────────────────────────────

export function getInbox(userId: string, filters: FindInboxOptions): Promise<InboxResponse> {
  return getCachedInbox({ repos: repos() }, userId, filters);
}

/** One external email with its mailbox label. Legacy rows ingested before
 *  the multi-job extractor (gap #786) — or before the patchMany jsonb-persist
 *  fix — have NULL apply_urls and only the scalar apply_url (first hit):
 *  re-run the anchor-first extractor on the stored body and persist it back
 *  so a LinkedIn / Indeed / Wellfound digest surfaces every role. */
export async function getExternalEmail(userId: string, id: string) {
  const r = repos();
  const row = await r.externalEmailMessages.findByIdWithAccount(id, userId);
  if (!row) throw emailNotFound();

  let applyUrls = (row as any).applyUrls ?? null;
  if ((!applyUrls || applyUrls.length === 0) && (row.bodyHtml || row.bodyText)) {
    const extracted = extractJobLinks({
      bodyHtml: row.bodyHtml,
      bodyText: row.bodyText,
      snippet: row.snippet ?? "",
    });
    if (extracted.length > 0) {
      applyUrls = extracted;
      // Fire-and-forget persist. A failure here is non-fatal — the response
      // still carries the freshly-extracted array; the next view re-extracts.
      void r.externalEmailMessages
        .patch(row.id, { applyUrls: extracted as any } as any)
        .catch((err) => {
          console.error(`[inbox] backfill apply_urls failed for ${row.id}:`, err);
        });
    }
  }

  return {
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
    applyUrls,
    isRead: row.isRead,
    isArchived: row.isArchived,
    receivedAt:
      row.receivedAt instanceof Date
        ? row.receivedAt.toISOString()
        : new Date(row.receivedAt).toISOString(),
    providerMessageId: row.providerMessageId,
    providerThreadId: row.providerThreadId,
  };
}

// ── Read state / archive ─────────────────────────────────────────────────────

export async function setExternalEmailRead(userId: string, id: string, read: boolean): Promise<void> {
  const messages = repos().externalEmailMessages;
  if (read) await messages.markRead(id, userId);
  else await messages.markUnread(id, userId);
  bumpInboxFor([userId]);
}

export async function markAllExternalEmailsRead(userId: string): Promise<void> {
  await repos().externalEmailMessages.markAllReadForUser(userId);
  bumpInboxFor([userId]);
}

export async function setExternalEmailArchived(userId: string, id: string, archived: boolean): Promise<void> {
  await repos().externalEmailMessages.setArchived(id, userId, archived);
  bumpInboxFor([userId]);
}

/** Bulk dismiss/restore — the per-account+providerMessageId unique key means
 *  re-sync will not reinsert archived rows ("remove, don't pull again"). */
export async function setExternalEmailsArchived(userId: string, ids: string[], archived: boolean): Promise<void> {
  await repos().externalEmailMessages.setArchivedBulk(ids, userId, archived);
  bumpInboxFor([userId]);
}

// ── Junk ─────────────────────────────────────────────────────────────────────

export type JunkMatchKind = "sender" | "domain" | "sender+subject" | string;

export interface JunkResult {
  ruleId: string;
  ruleName: string;
  conditions: Array<{ field: string; op: string; value: string }>;
}

/** Mark as Junk — archive the message, retag it `spam`, and mint (or re-
 *  enable) a user rule keyed on the sender / domain / sender+subject so future
 *  syncs auto-archive every match. The classifier honours user rules ahead of
 *  defaults, so a Stage-1 hit short-circuits LLM + dedup + auto-create. */
export async function junkExternalEmail(
  userId: string,
  id: string,
  matchKind: JunkMatchKind,
  matchValueOverride: string | null,
): Promise<JunkResult> {
  const r = repos();
  const row = await r.externalEmailMessages.findByIdWithAccount(id, userId);
  if (!row) throw emailNotFound();

  const fromEmail = (row.fromEmail || "").toLowerCase().trim();
  const atIdx = fromEmail.indexOf("@");
  const fromDomain = atIdx >= 0 ? fromEmail.slice(atIdx + 1) : fromEmail;
  let conditions: JunkResult["conditions"];
  let ruleName: string;
  switch (matchKind) {
    case "domain":
      conditions = [{ field: "from_domain", op: "equals", value: matchValueOverride ?? fromDomain }];
      ruleName = `Junk: domain ${matchValueOverride ?? fromDomain}`;
      break;
    case "sender+subject":
      conditions = [
        { field: "from_email", op: "equals", value: fromEmail },
        { field: "subject", op: "contains", value: matchValueOverride ?? (row.subject || "").trim() },
      ];
      ruleName = `Junk: ${fromEmail} · "${matchValueOverride ?? row.subject ?? ""}"`;
      break;
    case "sender":
    default:
      conditions = [{ field: "from_email", op: "equals", value: matchValueOverride ?? fromEmail }];
      ruleName = `Junk: ${matchValueOverride ?? fromEmail}`;
      break;
  }

  // Idempotent — re-junking the same sender re-enables the existing rule
  // instead of growing the rule list.
  const existing = await r.emailUserRules.findAllForUser(userId);
  const existingMatch = existing.find((rule) => rule.name === ruleName);
  let ruleId: string;
  if (existingMatch) {
    if (!existingMatch.isEnabled) {
      await r.emailUserRules.patch(existingMatch.id, userId, { isEnabled: true } as any);
    }
    ruleId = existingMatch.id;
  } else {
    const created = await r.emailUserRules.insert({
      userId,
      name: ruleName,
      conditions: conditions as any,
      actionCategory: "spam",
      actionScore: "1.000" as any,
      isEnabled: true,
      // Junk rules run BEFORE every default rule so a junked LinkedIn
      // newsletter never gets caught by the linkedin.com ATS rule.
      priority: 10,
    } as any);
    ruleId = created.id;
  }

  // Archive + retag this row so it leaves the current view and shows under
  // the "Junk" filter — the rule only governs future ingests.
  await r.externalEmailMessages.setArchived(row.id, userId, true);
  await r.externalEmailMessages.patch(row.id, { category: "spam" } as any);
  bumpInboxFor([userId]);

  return { ruleId, ruleName, conditions };
}

// ── Client-driven sync (#755 / #826) ─────────────────────────────────────────

/** Persist + classify one browser-pulled chunk. Failures surface as
 *  INGEST_FAILED with the Drizzle/Neon cause chain's SQLSTATE + detail
 *  (db/errors.ts, gap #727) instead of "Failed query: …". */
export async function ingestEmailChunk(
  llm: LLMClient,
  userId: string,
  input: { accountId: string; messages: IngestRequestMessage[] },
): Promise<IngestResult> {
  let result: IngestResult;
  try {
    result = await ingestForAccount({ repos: repos(), llm }, userId, input);
  } catch (err) {
    console.error("[email-ingest] route failed:", err);
    throw new DomainError(400, "INGEST_FAILED", describeDbError(err));
  }
  bumpInboxFor([userId]);
  return result;
}

/** Normalise the client's loose aggregate payload into the finalize shape. */
function toAggregate(agg: Record<string, any>) {
  return {
    messagesIngested: Number(agg.messagesIngested) || 0,
    messagesExcluded: Number(agg.messagesExcluded) || 0,
    messagesJobRelated: Number(agg.messagesJobRelated) || 0,
    jobsLinked: Number(agg.jobsLinked) || 0,
    jobsCreated: Number(agg.jobsCreated) || 0,
    rulesFired:
      agg.rulesFired && typeof agg.rulesFired === "object"
        ? (agg.rulesFired as Record<string, number>)
        : {},
    status: (agg.status === "error" || agg.status === "partial" ? agg.status : "success") as
      | "success"
      | "partial"
      | "error",
    errorMessage: typeof agg.errorMessage === "string" ? agg.errorMessage : null,
  };
}

/** Trailing call for a logical sync: writes the `email_sync_runs` audit row
 *  (gap #811), advances the provider cursor (gap #727) and meters ONE
 *  `email_sync` event for the whole sync (gap #812). */
export async function finalizeEmailSync(
  userId: string,
  input: { accountId: string; syncSessionId: string; nextCursor: string | null; aggregate: Record<string, any> },
): Promise<FinalizeResult> {
  const aggregate = toAggregate(input.aggregate);
  let result: FinalizeResult;
  try {
    result = await finalizeSyncSession({ repos: repos() }, userId, {
      accountId: input.accountId,
      syncSessionId: input.syncSessionId,
      nextCursor: input.nextCursor,
      aggregate,
    });
  } catch (err) {
    console.error("[email-finalize] route failed:", err);
    throw new DomainError(400, "FINALIZE_FAILED", describeDbError(err));
  }
  // Best-effort; a ledger blip must not poison the cursor result.
  try {
    await servicesProcessor.meter({
      userId,
      eventType: "email_sync",
      quantity: 1,
      metadata: {
        accountId: input.accountId,
        syncSessionId: input.syncSessionId,
        messagesIngested: aggregate.messagesIngested,
      },
    });
  } catch (meterErr) {
    console.error("[email-finalize] meter failed:", meterErr);
  }
  bumpInboxFor([userId]);
  return result;
}
