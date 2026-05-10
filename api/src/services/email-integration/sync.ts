/**
 * Sync orchestrator — runs one full pass for one connected mailbox.
 *
 * Flow per account:
 *   1. Refresh the access token using the encrypted refresh token.
 *   2. Pull deltas from the provider.
 *   3. For each new message:
 *        a. Insert raw row (idempotent on (accountId, providerMessageId)).
 *        b. Run the two-stage classifier (rules → LLM).
 *        c. Generate a per-message summary for job-related messages
 *           above the noise floor.
 *        d. Run dedup against the user's applied/saved jobs.
 *        e. If the dedup produced a confident match, set linkedJobId.
 *        f. Otherwise, if the message is a high-confidence
 *           job_opportunity, auto-create a `job_items` row and link it.
 *   4. Persist provider cursor + sync-run audit row.
 *   5. Generate a digest summary across the new messages.
 *
 * Failure isolation: a per-message failure is logged + counted but
 * doesn't stop the run. A whole-run failure (token refresh, provider
 * outage) marks the sync_run row as `error` so SA / the user sees the
 * failure surface.
 */

import type { Repos } from "../../repositories/index.js";
import type { LLMClient } from "../adapters/llm-client.js";
import type { ExternalEmailAccountRow } from "../../repositories/externalEmailAccountsRepository.js";
import type { ExternalEmailMessageRow, ExternalEmailMessageInsert } from "../../repositories/externalEmailMessagesRepository.js";
import { gmailProvider } from "./providers/gmail.js";
import { outlookProvider } from "./providers/outlook.js";
import type { EmailProvider, NormalisedEmail } from "./providers/types.js";
import { refreshAccessToken, type EmailProviderId } from "./oauth.js";
import { classifyEmail, summariseEmail } from "./classify.js";
import {
  autoCreateJobFromEmail,
  dedupAgainst,
  extractApplyUrls,
  loadDedupContext,
} from "./dedup.js";
import { buildSyncDigest } from "./digest.js";

const PROVIDER_REGISTRY: Record<EmailProviderId, EmailProvider> = {
  gmail: gmailProvider,
  outlook: outlookProvider,
};

export interface SyncDeps {
  repos: Pick<
    Repos,
    | "externalEmailAccounts"
    | "externalEmailMessages"
    | "emailUserRules"
    | "emailSyncRuns"
    | "jobs"
  >;
  llm: LLMClient;
  /** Initial backfill cap for first-run accounts. */
  backfillLimit?: number;
}

export interface SyncSummary {
  accountId: string;
  status: "success" | "partial" | "error";
  messagesSynced: number;
  messagesClassified: number;
  jobsLinked: number;
  jobsCreated: number;
  errorMessage: string | null;
}

export async function syncAccount(
  deps: SyncDeps,
  account: ExternalEmailAccountRow,
): Promise<SyncSummary> {
  const startedAt = new Date();

  const run = await deps.repos.emailSyncRuns.start({
    userId: account.userId,
    accountId: account.id,
    startedAt,
    status: "running",
  } as any);

  let status: SyncSummary["status"] = "success";
  let errorMessage: string | null = null;
  let synced = 0;
  let classified = 0;
  let linked = 0;
  let created = 0;
  const persisted: ExternalEmailMessageRow[] = [];

  try {
    if (!account.oauthRefreshTokenEnc) {
      throw new Error("No refresh token on account");
    }
    const provider = PROVIDER_REGISTRY[account.provider as EmailProviderId];
    if (!provider) throw new Error(`Unknown provider: ${account.provider}`);

    const { accessToken } = await refreshAccessToken(
      account.provider as EmailProviderId,
      account.oauthRefreshTokenEnc,
    );

    const cursor = account.provider === "gmail" ? account.lastHistoryId : account.lastDeltaLink;
    const { messages: pulled, nextCursor } = await provider.pullDelta(
      { accessToken },
      { cursor: cursor ?? null, backfillLimit: deps.backfillLimit ?? 30 },
    );

    const userRules = await deps.repos.emailUserRules.findEnabledForUser(account.userId);

    for (const email of pulled) {
      try {
        const row = await persistAndProcess({
          deps,
          account,
          email,
          userRules,
        });
        if (row) {
          persisted.push(row);
          synced += 1;
          if (row.category) classified += 1;
          if (row.linkedJobId) {
            if (row.dedupMethod === "auto_created") created += 1;
            else linked += 1;
          }
        }
      } catch (err) {
        status = "partial";
        console.error(`[email-sync] message ${email.providerMessageId} failed:`, err);
      }
    }

    // Persist provider cursor.
    const cursorPatch: Partial<ExternalEmailAccountRow> = { lastSyncedAt: new Date() };
    if (nextCursor) {
      if (account.provider === "gmail") cursorPatch.lastHistoryId = nextCursor;
      else if (account.provider === "outlook") cursorPatch.lastDeltaLink = nextCursor;
    }
    await deps.repos.externalEmailAccounts.patch(account.id, account.userId, cursorPatch as any);

    // Build the digest off the freshly persisted batch.
    const digestSummary = await buildSyncDigest({ llm: deps.llm }, persisted);

    await deps.repos.emailSyncRuns.patch(run.id, {
      completedAt: new Date(),
      status,
      messagesSynced: synced,
      messagesClassified: classified,
      jobsLinked: linked,
      jobsCreated: created,
      digestSummary: digestSummary ?? undefined,
    } as any);
  } catch (err) {
    status = "error";
    errorMessage = err instanceof Error ? err.message : String(err);
    await deps.repos.externalEmailAccounts.patch(account.id, account.userId, {
      status: "error",
      lastError: errorMessage,
    } as any);
    await deps.repos.emailSyncRuns.patch(run.id, {
      completedAt: new Date(),
      status: "error",
      errorMessage,
    } as any);
  }

  return {
    accountId: account.id,
    status,
    messagesSynced: synced,
    messagesClassified: classified,
    jobsLinked: linked,
    jobsCreated: created,
    errorMessage,
  };
}

interface PersistArgs {
  deps: SyncDeps;
  account: ExternalEmailAccountRow;
  email: NormalisedEmail;
  userRules: Awaited<ReturnType<Repos["emailUserRules"]["findEnabledForUser"]>>;
}

async function persistAndProcess(args: PersistArgs): Promise<ExternalEmailMessageRow | null> {
  const { deps, account, email, userRules } = args;

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
    receivedAt: email.receivedAt,
    rawMetadata: email.rawMetadata as any,
  } as any;

  const row = await deps.repos.externalEmailMessages.insert(insertPayload);
  if (!row) return null;

  // Idempotency: if the row already exists from a prior run with
  // classification + dedup populated, skip the work.
  if (row.category && (row.linkedJobId || row.dedupScore != null)) {
    return row;
  }

  const classification = await classifyEmail({ llm: deps.llm }, email, userRules);
  const summary = await summariseEmail({ llm: deps.llm }, email, classification);
  const applyUrls = extractApplyUrls(email);
  const applyUrl = applyUrls[0] ?? null;

  // Skip dedup + auto-create for non-job-related categories.
  let linkedJobId: string | null = null;
  let dedupScore: number | null = null;
  let dedupMethod: string | null = null;

  const isJobRelated =
    classification.category === "job_opportunity" ||
    classification.category === "application_status" ||
    classification.category === "interview_invite" ||
    classification.category === "offer" ||
    classification.category === "rejection" ||
    classification.category === "recruiter_outreach";

  if (isJobRelated) {
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
    score: String(classification.score) as any, // numeric column accepts string
    summary,
    applyUrl,
    linkedJobId,
    dedupScore: dedupScore == null ? null : (String(dedupScore) as any),
    dedupMethod: dedupMethod as any,
  } as any);

  return {
    ...row,
    category: classification.category,
    score: String(classification.score),
    summary,
    applyUrl,
    linkedJobId,
    dedupScore: dedupScore == null ? null : String(dedupScore),
    dedupMethod,
  } as ExternalEmailMessageRow;
}

/** Sweep ALL active accounts due for a sync. Called by the cron worker
 *  + the manual "sync now" admin trigger. */
export async function syncAllDueAccounts(
  deps: SyncDeps,
  staleAfterMs = 5 * 60 * 1000,
): Promise<SyncSummary[]> {
  const cutoff = new Date(Date.now() - staleAfterMs);
  const accounts = await deps.repos.externalEmailAccounts.findDueForSync(cutoff);
  const summaries: SyncSummary[] = [];
  for (const account of accounts) {
    summaries.push(await syncAccount(deps, account));
  }
  return summaries;
}
