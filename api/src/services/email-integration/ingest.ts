/**
 * Client-driven ingest — the only path connected mailboxes use to
 * reach the server.
 *
 * The PWA orchestrator
 * ([`runClientSync`](../../../../../frontend/lib/email-integration/sync-client.ts))
 * fetches mail directly from Gmail/Outlook (using short-lived access
 * tokens vended by `GET /accounts/:id/access-token`), runs Stage-1
 * rules client-side, and POSTs chunks of normalised messages to
 * `POST /inbox/external-emails/ingest`. This service persists each
 * chunk, runs Stage-2 LLM classification ONLY for messages the
 * client couldn't classify, then runs dedup + auto-create. When all
 * chunks complete, the client makes one trailing
 * `POST /inbox/external-emails/finalize` call which runs the
 * sync-run audit upsert + provider-cursor advance.
 *
 * Why one-Worker-invocation-per-chunk: each POST is its own
 * Cloudflare Workers invocation with a fresh subrequest budget,
 * so a 100-message backfill fans across N invocations instead of
 * clipping mid-sweep (the failure mode that made #755 / #757 retire
 * the old server-side cron sweep).
 *
 * Why a separate finalize invocation (gap #826): keeping the
 * sync-run upsert + cursor write inside the ingest chunk loaded
 * every chunk with trailing bookkeeping that ran AFTER the LLM
 * fan-out had already burned most of the Bundled-Worker
 * 50-subrequest budget. Splitting them lets the chunk spend its
 * full budget on persistence + classification, then a tiny
 * finalize invocation handles the two writes with budget to spare.
 *
 * Bulk-ops contract (gap #815 close): each chunk runs in three passes
 * to keep the per-chunk Cloudflare Worker subrequest count flat in N:
 *   1. PASS A — one batched INSERT (+ one batched conflict-backfill
 *      SELECT) via `externalEmailMessages.insertMany()`.
 *   2. PASS B — in-memory loop: Stage-1 rules + Stage-2 LLM +
 *      summary (ONLY for messages that pass the job-category gate —
 *      gap #826) + dedup (against ONE pre-loaded `DedupContext`) +
 *      auto-create. The only per-message subrequests in this pass
 *      are the LLM calls and the optional `insertJob` for
 *      auto-create — every other op is in-memory.
 *   3. PASS C — one batched UPDATE via `externalEmailMessages.patchMany()`.
 * Result: chunk subrequests ≈ 3 fixed (account lookup, rules load,
 * dedup load) + 1 insertMany + ≤N Stage-2 LLM classify (only when
 * client-side Stage-1 missed) + ≤M summarise (only `passed`
 * messages — typically a small fraction) + ≤K auto-create inserts +
 * 1 patchMany. Down from ~6N before #815 and from ~2N+2 trailing
 * writes before #826.
 *
 * Idempotent on `(accountId, providerMessageId)` — re-posting the
 * same chunk is a no-op. The cursor only advances at finalize, so a
 * dropped finalize call leaves the cursor pointing at the start of
 * the just-synced batch; the next sync re-pulls and the per-row
 * idempotency check (`if (row.category && row.linkedJobId …)` in
 * PASS B) skips Stage-2 + summary for the already-classified rows.
 */

import type { Repos } from "../../repositories/index.js";
import type { LLMClient } from "../adapters/llm-client.js";
import type { ExternalEmailAccountRow } from "../../repositories/externalEmailAccountsRepository.js";
import type {
  ExternalEmailMessageInsert,
  ExternalEmailMessageRow,
} from "../../repositories/externalEmailMessagesRepository.js";
import { describeDbError, runWithNeonRetry } from "../../db/errors.js";
import { classifyEmail, summariseEmail } from "./classify.js";
import {
  autoCreateJobFromEmail,
  dedupAgainst,
  extractJobLinks,
  loadDedupContext,
  type DedupContext,
} from "./dedup.js";
import type { NormalisedEmail } from "./providers/types.js";
import {
  classifyByRules,
  type ClassificationResult,
  isJobCategory,
  type NormalisedEmailWire,
} from "../../../../shared/email-classification/index.js";

export interface IngestDeps {
  repos: Pick<
    Repos,
    | "externalEmailAccounts"
    | "externalEmailMessages"
    | "emailUserRules"
    | "emailSyncRuns"
    | "jobs"
  >;
  llm: LLMClient;
}

export interface IngestRequestMessage extends NormalisedEmailWire {
  /** Optional client-side Stage-1 result — when present, server skips
   *  the LLM call. Server still re-validates by running its own
   *  Stage-1 (rules engine is shared); the client tag is treated as a
   *  hint not a source of truth. */
  clientCategory?: string;
  clientScore?: number;
  clientRuleName?: string;
}

export interface IngestRequest {
  accountId: string;
  messages: IngestRequestMessage[];
  /** Provider-side delta cursor to persist on the account row once
   *  the chunk lands — Gmail historyId or Outlook deltaLink. */
  nextCursor?: string | null;
  /** Client-generated UUID stamped on every chunk POST of a single
   *  logical sync. Lets `email_sync_runs` aggregate per-session
   *  rather than per-chunk (gap #811). */
  syncSessionId?: string | null;
}

export interface IngestResult {
  accountId: string;
  messagesIngested: number;
  messagesExcluded: number;
  messagesJobRelated: number;
  jobsLinked: number;
  jobsCreated: number;
  rulesFired: Record<string, number>;
  errorMessage: string | null;
}

/** Aggregate the client computed across every chunk POST in this
 *  logical sync. The finalize endpoint folds it into one
 *  `email_sync_runs` row and advances the provider cursor. */
export interface FinalizeRequest {
  accountId: string;
  syncSessionId: string;
  /** Provider cursor advanced by the client during this logical sync.
   *  Persisted on the account row so the next pull resumes after the
   *  messages this session ingested. Null means the client didn't
   *  reach a new cursor (e.g. zero messages this sync). */
  nextCursor: string | null;
  aggregate: {
    messagesIngested: number;
    messagesExcluded: number;
    messagesJobRelated: number;
    jobsLinked: number;
    jobsCreated: number;
    rulesFired: Record<string, number>;
    /** Worst per-chunk status the client saw. */
    status: "success" | "partial" | "error";
    errorMessage: string | null;
  };
}

export interface FinalizeResult {
  accountId: string;
  syncSessionId: string;
  cursorAdvanced: boolean;
  errorMessage: string | null;
}

const MAX_CHUNK_SIZE = 25;

function toServerNormalisedEmail(m: IngestRequestMessage): NormalisedEmail {
  // Strip the client-side hint fields so the server's view of the
  // email matches the cron-sweep shape — `receivedAt` stays ISO, the
  // DB insert boundary in `persistAndProcess` does the Date wrap.
  return {
    providerMessageId: m.providerMessageId,
    providerThreadId: m.providerThreadId,
    fromEmail: m.fromEmail,
    fromName: m.fromName,
    subject: m.subject,
    snippet: m.snippet,
    bodyHtml: m.bodyHtml,
    bodyText: m.bodyText,
    receivedAt: m.receivedAt,
    rawMetadata: m.rawMetadata,
  };
}

/** Verify the user owns the account and it's connected. */
async function loadOwnedAccount(
  deps: IngestDeps,
  userId: string,
  accountId: string,
): Promise<ExternalEmailAccountRow | null> {
  return deps.repos.externalEmailAccounts.findById(accountId, userId);
}

export async function ingestForAccount(
  deps: IngestDeps,
  userId: string,
  request: IngestRequest,
): Promise<IngestResult> {
  if (request.messages.length > MAX_CHUNK_SIZE) {
    throw new Error(
      `Chunk size ${request.messages.length} exceeds limit ${MAX_CHUNK_SIZE} — client must page`,
    );
  }

  const account = await loadOwnedAccount(deps, userId, request.accountId);
  if (!account) throw new Error("Account not found or not owned by user");

  const minScore = Number(account.minJobScore ?? "0.5");

  const result: IngestResult = {
    accountId: account.id,
    messagesIngested: 0,
    messagesExcluded: 0,
    messagesJobRelated: 0,
    jobsLinked: 0,
    jobsCreated: 0,
    rulesFired: {},
    errorMessage: null,
  };

  if (request.messages.length === 0) {
    await advanceCursor(deps, account, request.nextCursor ?? null, result);
    return result;
  }

  // Pre-flight: load rules + dedup context ONCE for the entire chunk.
  // Both lookups are user-scoped (not email-scoped) so paying for them
  // per-message was pure waste — that was the #815 bug.
  const [userRules, dedupCtx] = await Promise.all([
    deps.repos.emailUserRules.findEnabledForUser(account.userId),
    loadDedupContext({ jobs: deps.repos.jobs }, account.userId),
  ]);

  // ───── PASS A — bulk insert.
  const insertPayloads: ExternalEmailMessageInsert[] = request.messages.map(
    (wireMsg) => {
      const email = toServerNormalisedEmail(wireMsg);
      return {
        userId: account.userId,
        accountId: account.id,
        provider: account.provider,
        providerMessageId: email.providerMessageId,
        providerThreadId: email.providerThreadId,
        fromEmail: email.fromEmail,
        fromName: email.fromName,
        subject: email.subject,
        snippet: email.snippet,
        bodyHtml: email.bodyHtml,
        bodyText: email.bodyText,
        receivedAt: new Date(email.receivedAt),
        rawMetadata: email.rawMetadata as any,
      } as ExternalEmailMessageInsert;
    },
  );

  let insertedRows: ExternalEmailMessageRow[];
  try {
    insertedRows = await deps.repos.externalEmailMessages.insertMany(
      insertPayloads,
    );
  } catch (err) {
    console.error("[email-ingest] bulk insert failed:", err);
    result.errorMessage = describeDbError(err);
    return result;
  }

  // Map provider-message-id → row so the classification pass can pair
  // each wire message with its persisted row in O(1).
  const rowByProviderId = new Map<string, ExternalEmailMessageRow>();
  for (const row of insertedRows) {
    rowByProviderId.set(row.providerMessageId, row);
  }

  // ───── PASS B — in-memory classification + dedup + auto-create.
  // Collect patches into one array; nothing here writes to the
  // messages table — the final PASS C drains the whole array in one
  // UPDATE.
  const patches: Array<{
    id: string;
    patch: Partial<ExternalEmailMessageInsert>;
  }> = [];

  for (const wireMsg of request.messages) {
    try {
      const row = rowByProviderId.get(wireMsg.providerMessageId);
      if (!row) continue; // insertMany dropped it — shouldn't happen, defensive.
      const email = toServerNormalisedEmail(wireMsg);

      // Idempotency — already-classified rows skip the LLM round-trip
      // entirely. Mirrors the pre-bulk behaviour.
      if (row.category && (row.linkedJobId || row.dedupScore != null)) {
        result.messagesIngested += 1;
        const score = row.score == null ? 0 : Number(row.score);
        if (isJobCategory(row.category as any) && score >= minScore) {
          result.messagesJobRelated += 1;
        } else {
          result.messagesExcluded += 1;
        }
        continue;
      }

      // Stage-1 / Stage-2 classification.
      let classification: ClassificationResult;
      const stage1 = classifyByRules(email, userRules as any);
      if (stage1) {
        classification = stage1;
      } else {
        classification = await classifyEmail({ llm: deps.llm }, email, userRules);
      }
      if (classification.ruleName) {
        result.rulesFired[classification.ruleName] =
          (result.rulesFired[classification.ruleName] ?? 0) + 1;
      }

      // Junk shortcut — archive on first persist; no summary / dedup
      // / auto-create. Patch is collected into the bulk drain.
      const isUserJunk =
        classification.source === "user_rule" &&
        classification.category === "spam";
      if (isUserJunk) {
        patches.push({
          id: row.id,
          patch: {
            category: classification.category,
            score: String(classification.score) as any,
            isArchived: true,
          } as Partial<ExternalEmailMessageInsert>,
        });
        result.messagesIngested += 1;
        result.messagesExcluded += 1;
        continue;
      }

      // Pull every anchor-with-apply-URL out of the body. Digest mail
      // (LinkedIn Job Alerts, Indeed weekly, Wellfound newsletter)
      // typically contains N jobs in one message — the array is what
      // powers the multi-Apply CTA list in the detail sheet. The
      // scalar `applyUrl` (first entry) is what dedup + auto-create
      // operate on (single-job-per-email for now; multi-job auto-create
      // is tracked in the gap register). Cheap, in-memory.
      const jobLinks = extractJobLinks(email);
      const applyUrls = jobLinks.length > 0 ? jobLinks : null;
      const applyUrl = jobLinks[0]?.url ?? null;

      let linkedJobId: string | null = null;
      let dedupScore: number | null = null;
      let dedupMethod: string | null = null;

      const passed =
        isJobCategory(classification.category) && classification.score >= minScore;

      // Summary is only shown in the inbox detail sheet, and excluded
      // messages don't surface there by default — gate the LLM call on
      // `passed` so a chunk of 20 newsletters doesn't fan out into 20
      // summary LLM subrequests (gap #826). For excluded rows the
      // summary column stays null; the `Show dismissed` / `Junk` views
      // render the snippet instead.
      const summary = passed
        ? await summariseEmail({ llm: deps.llm }, email, classification)
        : null;

      if (passed) {
        // Dedup against the chunk-scoped context. Auto-created jobs in
        // the same chunk join `dedupCtx.jobs` immediately so the next
        // message in this pass benefits from the freshly-created row.
        const dedup = dedupAgainst(email, dedupCtx);
        if (dedup.jobId && dedup.score >= 0.6) {
          linkedJobId = dedup.jobId;
          dedupScore = dedup.score;
          dedupMethod = dedup.method;
        } else {
          const ac = await autoCreateJobFromEmail(
            { jobs: deps.repos.jobs },
            account.userId,
            email,
            {
              classifierScore: classification.score,
              category: classification.category,
            },
          );
          if (ac.jobId) {
            linkedJobId = ac.jobId;
            dedupScore = classification.score;
            dedupMethod = "auto_created";
            // Fold the new job into the chunk's dedup context so the
            // next message's `dedupAgainst()` can match it — keeps the
            // bulk pass behaviour identical to the old per-message
            // pass where each iteration re-loaded the context.
            dedupCtx.jobs.push({
              id: ac.jobId,
              title: (email.subject ?? "").slice(0, 240),
              company: email.fromName ?? null,
              applyUrl,
              sourceUrl: applyUrl,
            } as DedupContext["jobs"][number]);
          }
        }
      }

      patches.push({
        id: row.id,
        patch: {
          category: classification.category,
          score: String(classification.score) as any,
          summary,
          applyUrl,
          applyUrls: applyUrls as any,
          linkedJobId,
          dedupScore: dedupScore == null ? null : (String(dedupScore) as any),
          dedupMethod: dedupMethod as any,
        } as Partial<ExternalEmailMessageInsert>,
      });

      result.messagesIngested += 1;
      if (passed) result.messagesJobRelated += 1;
      else result.messagesExcluded += 1;
      if (linkedJobId) {
        if (dedupMethod === "auto_created") result.jobsCreated += 1;
        else result.jobsLinked += 1;
      }
    } catch (err) {
      console.error(
        `[email-ingest] message ${wireMsg.providerMessageId} failed:`,
        err,
      );
      // Continue — one bad message shouldn't drop the rest of the chunk.
      result.errorMessage = describeDbError(err);
    }
  }

  // ───── PASS C — bulk patch + cursor advance.
  if (patches.length > 0) {
    try {
      await deps.repos.externalEmailMessages.patchMany(patches);
    } catch (err) {
      console.error("[email-ingest] bulk patch failed:", err);
      result.errorMessage = describeDbError(err);
    }
  }

  return result;
}

/** Trailing call for a logical sync — runs the `email_sync_runs`
 *  audit upsert + provider cursor advance in a single tiny Worker
 *  invocation, well clear of the per-chunk subrequest budget the
 *  ingest path is competing for (gap #826).
 *
 *  Best-effort: a sync-run upsert failure must not throw, since the
 *  underlying ingest chunks already persisted their messages. A
 *  cursor-advance failure is recoverable on the next sync (idempotent
 *  on (accountId, providerMessageId)) so it's also caught + reported
 *  on the result; one retry via `runWithNeonRetry` (gap #727).
 *
 *  Returns success even on partial failure — the client uses
 *  `errorMessage` to decide whether to surface a non-fatal warning. */
export async function finalizeSyncSession(
  deps: Pick<IngestDeps, "repos">,
  userId: string,
  request: FinalizeRequest,
): Promise<FinalizeResult> {
  const account = await deps.repos.externalEmailAccounts.findById(
    request.accountId,
    userId,
  );
  if (!account) throw new Error("Account not found or not owned by user");

  const result: FinalizeResult = {
    accountId: account.id,
    syncSessionId: request.syncSessionId,
    cursorAdvanced: false,
    errorMessage: request.aggregate.errorMessage,
  };

  // Sync-run audit row (gap #811). Single INSERT since the chunks no
  // longer write to this table — the upsert path is INSERT-on-empty.
  try {
    await deps.repos.emailSyncRuns.upsertChunkResult({
      userId: account.userId,
      accountId: account.id,
      syncSessionId: request.syncSessionId,
      delta: {
        messagesSynced: request.aggregate.messagesIngested,
        // `messagesClassified` mirrors `messagesIngested` for this
        // path — every row inserted by ingest also gets a category
        // assigned (Stage-1 or Stage-2 or the LLM-failure fallback).
        // Kept as a distinct column for parity with the pre-cutover
        // server-sweep shape the Sync History sheet renders.
        messagesClassified: request.aggregate.messagesIngested,
        messagesExcluded: request.aggregate.messagesExcluded,
        messagesJobRelated: request.aggregate.messagesJobRelated,
        jobsLinked: request.aggregate.jobsLinked,
        jobsCreated: request.aggregate.jobsCreated,
        rulesFired: request.aggregate.rulesFired,
        errorMessage: request.aggregate.errorMessage,
        status:
          request.aggregate.status === "error"
            ? "partial"
            : request.aggregate.status,
      },
    });
  } catch (err) {
    console.error("[email-finalize] sync-run upsert failed:", err);
    const reason = describeDbError(err);
    result.errorMessage = result.errorMessage
      ? `${result.errorMessage}; sync-run: ${reason}`
      : `sync-run: ${reason}`;
  }

  // Cursor advance — the only write that the next sync depends on.
  const cursorPatch: Partial<ExternalEmailAccountRow> = {
    lastSyncedAt: new Date(),
  };
  if (request.nextCursor) {
    if (account.provider === "gmail")
      cursorPatch.lastHistoryId = request.nextCursor;
    else if (account.provider === "outlook")
      cursorPatch.lastDeltaLink = request.nextCursor;
  }
  try {
    await runWithNeonRetry(
      () =>
        deps.repos.externalEmailAccounts.patch(
          account.id,
          account.userId,
          cursorPatch as any,
        ),
      { label: "email-finalize:cursor-patch" },
    );
    result.cursorAdvanced = true;
  } catch (err) {
    const reason = describeDbError(err);
    console.error(
      `[email-finalize] cursor-advance failed for account ${account.id} (messages already persisted):`,
      err,
    );
    result.errorMessage = result.errorMessage
      ? `${result.errorMessage}; cursor-advance: ${reason}`
      : `cursor-advance: ${reason}`;
  }

  return result;
}
