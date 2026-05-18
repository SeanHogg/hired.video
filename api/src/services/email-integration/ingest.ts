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
 * client couldn't classify, then runs dedup + auto-create.
 *
 * Why one-Worker-invocation-per-chunk: each POST is its own
 * Cloudflare Workers invocation with a fresh subrequest budget,
 * so a 100-message backfill fans across N invocations instead of
 * clipping mid-sweep (the failure mode that made #755 / #757 retire
 * the old server-side cron sweep).
 *
 * Bulk-ops contract (gap #815 close): each chunk runs in three passes
 * to keep the per-chunk Cloudflare Worker subrequest count flat in N:
 *   1. PASS A — one batched INSERT (+ one batched conflict-backfill
 *      SELECT) via `externalEmailMessages.insertMany()`.
 *   2. PASS B — in-memory loop: Stage-1 rules + Stage-2 LLM +
 *      summary + dedup (against ONE pre-loaded `DedupContext`) +
 *      auto-create. The only per-message subrequests in this pass
 *      are the LLM calls and the optional `insertJob` for
 *      auto-create — every other op is in-memory.
 *   3. PASS C — one batched UPDATE via `externalEmailMessages.patchMany()`.
 * Result: chunk subrequests ≈ 4 fixed (account lookup, rules load,
 * dedup load, insertMany) + 2N LLM calls + ≤N auto-create inserts +
 * 1 patchMany + 1 cursor advance. Down from ~6N before.
 *
 * Idempotent on `(accountId, providerMessageId)` — re-posting the
 * same chunk is a no-op, and a transient Neon failure on the final
 * cursor-advance write is caught + retried via `runWithNeonRetry`
 * (gap #727) without 400-ing a chunk whose messages were already
 * persisted.
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
  extractApplyUrls,
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
  /** Provider cursor advanced by the client during this chunk. Persisted
   *  on the account row so the next pull resumes after these messages. */
  nextCursor?: string | null;
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

      const summary = await summariseEmail({ llm: deps.llm }, email, classification);
      const applyUrls = extractApplyUrls(email);
      const applyUrl = applyUrls[0] ?? null;

      let linkedJobId: string | null = null;
      let dedupScore: number | null = null;
      let dedupMethod: string | null = null;

      const passed =
        isJobCategory(classification.category) && classification.score >= minScore;
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

  await advanceCursor(deps, account, request.nextCursor ?? null, result);
  return result;
}

/** Advance the provider cursor + last-synced timestamp on the account.
 *  Losing this write is recoverable on the next sync (idempotent on
 *  (accountId, providerMessageId)) so a transient Neon HTTP blip must
 *  not 400 the chunk back to the client when messages already
 *  persisted. One retry via `runWithNeonRetry`; any remaining failure
 *  is recorded on `errorMessage` but doesn't throw (gap #727). */
async function advanceCursor(
  deps: IngestDeps,
  account: ExternalEmailAccountRow,
  nextCursor: string | null,
  result: IngestResult,
): Promise<void> {
  const cursorPatch: Partial<ExternalEmailAccountRow> = {
    lastSyncedAt: new Date(),
  };
  if (nextCursor) {
    if (account.provider === "gmail") cursorPatch.lastHistoryId = nextCursor;
    else if (account.provider === "outlook") cursorPatch.lastDeltaLink = nextCursor;
  }
  try {
    await runWithNeonRetry(
      () =>
        deps.repos.externalEmailAccounts.patch(
          account.id,
          account.userId,
          cursorPatch as any,
        ),
      { label: "email-ingest:cursor-patch" },
    );
  } catch (err) {
    const reason = describeDbError(err);
    console.error(
      `[email-ingest] cursor-advance failed for account ${account.id} (messages already persisted):`,
      err,
    );
    result.errorMessage = result.errorMessage
      ? `${result.errorMessage}; cursor-advance: ${reason}`
      : `cursor-advance: ${reason}`;
  }
}
