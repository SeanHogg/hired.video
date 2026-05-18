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
 * Cloudflare Workers invocation with a fresh 50-subrequest budget,
 * so a 100-message backfill fans across N invocations instead of
 * clipping mid-sweep (the failure mode that made #755 / #757 retire
 * the old server-side cron sweep).
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
import type { ExternalEmailMessageInsert } from "../../repositories/externalEmailMessagesRepository.js";
import { describeDbError, runWithNeonRetry } from "../../db/errors.js";
import { classifyEmail, summariseEmail } from "./classify.js";
import {
  autoCreateJobFromEmail,
  dedupAgainst,
  extractApplyUrls,
  loadDedupContext,
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
  const userRules = await deps.repos.emailUserRules.findEnabledForUser(account.userId);

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

  for (const wireMsg of request.messages) {
    try {
      const email = toServerNormalisedEmail(wireMsg);
      const insertPayload: ExternalEmailMessageInsert = {
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
        // ISO → Date at the DB insert boundary (mirrors sync.ts).
        receivedAt: new Date(email.receivedAt),
        rawMetadata: email.rawMetadata as any,
      } as any;

      const row = await deps.repos.externalEmailMessages.insert(insertPayload);
      if (!row) continue;

      // Idempotency — same outcome as sync.ts: if the row already has
      // category + dedup info, skip the LLM round-trip entirely.
      if (row.category && (row.linkedJobId || row.dedupScore != null)) {
        result.messagesIngested += 1;
        const score = row.score == null ? 0 : Number(row.score);
        if (isJobCategory(row.category as any) && score >= minScore) result.messagesJobRelated += 1;
        else result.messagesExcluded += 1;
        continue;
      }

      // Re-run Stage-1 server-side from the shared rules engine — never
      // trust the client tag blindly, but the rules are the SAME code
      // so we just confirm the classification. If Stage-1 returns
      // null AND the client didn't supply a hint either, fall through
      // to the LLM stage. This is the only place the server still
      // makes an Anthropic subrequest during ingest.
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

      // Junk shortcut — user authored a rule that says "this sender is
      // spam". Skip summary + dedup + auto-create entirely and archive
      // the row on insert so it never reaches the inbox feed. The
      // (accountId, providerMessageId) unique key keeps re-sync from
      // resurrecting it.
      const isUserJunk =
        classification.source === "user_rule" &&
        classification.category === "spam";
      if (isUserJunk) {
        await deps.repos.externalEmailMessages.patch(row.id, {
          category: classification.category,
          score: String(classification.score) as any,
          isArchived: true,
        } as any);
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

      const passed = isJobCategory(classification.category) && classification.score >= minScore;
      if (passed) {
        const ctx = await loadDedupContext(
          { jobs: deps.repos.jobs, externalEmailMessages: deps.repos.externalEmailMessages },
          account.userId,
          email,
        );
        const dedup = dedupAgainst(email, ctx);
        if (dedup.jobId && dedup.score >= 0.6) {
          linkedJobId = dedup.jobId;
          dedupScore = dedup.score;
          dedupMethod = dedup.method;
        } else {
          const ac = await autoCreateJobFromEmail(
            { jobs: deps.repos.jobs },
            account.userId,
            email,
            { classifierScore: classification.score, category: classification.category },
          );
          if (ac.jobId) {
            linkedJobId = ac.jobId;
            dedupScore = classification.score;
            dedupMethod = "auto_created";
          }
        }
      }

      await deps.repos.externalEmailMessages.patch(row.id, {
        category: classification.category,
        score: String(classification.score) as any,
        summary,
        applyUrl,
        linkedJobId,
        dedupScore: dedupScore == null ? null : (String(dedupScore) as any),
        dedupMethod: dedupMethod as any,
      } as any);

      result.messagesIngested += 1;
      if (passed) result.messagesJobRelated += 1;
      else result.messagesExcluded += 1;
      if (linkedJobId) {
        if (dedupMethod === "auto_created") result.jobsCreated += 1;
        else result.jobsLinked += 1;
      }
    } catch (err) {
      console.error(`[email-ingest] message ${wireMsg.providerMessageId} failed:`, err);
      // Continue — one bad message shouldn't drop the rest of the chunk.
      // describeDbError walks the cause chain so we surface the real
      // SQLSTATE/detail instead of Drizzle's "Failed query: ..." wrapper.
      result.errorMessage = describeDbError(err);
    }
  }

  // Advance the provider cursor if the client supplied one. The PWA
  // is the source of truth on what was synced — losing this write is
  // recoverable on the next sync (idempotent on
  // (accountId, providerMessageId)). So a transient Neon HTTP blip
  // here MUST NOT 400 the chunk back to the client when the messages
  // were already persisted.
  //
  // Strategy: one retry on transient errors via runWithNeonRetry; any
  // remaining failure is recorded on errorMessage but does not throw.
  // (Gap #727: previously the wrapper text "Failed query: update ..."
  // was the entire response body.)
  const cursorPatch: Partial<ExternalEmailAccountRow> = { lastSyncedAt: new Date() };
  if (request.nextCursor) {
    if (account.provider === "gmail") cursorPatch.lastHistoryId = request.nextCursor;
    else if (account.provider === "outlook") cursorPatch.lastDeltaLink = request.nextCursor;
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

  return result;
}
