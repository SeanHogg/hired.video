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
import { JOB_INBOX_CATEGORIES } from "../../repositories/externalEmailMessagesRepository.js";
import type { ClassificationResult } from "./rules.js";

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
  /** Messages whose final category fell outside the job-related set
   *  OR whose confidence was below the per-account threshold. They
   *  remain in the DB but are hidden from the inbox feed. */
  messagesExcluded: number;
  /** Messages that surfaced in the inbox — passed both the category
   *  and the minJobScore checks. */
  messagesJobRelated: number;
  jobsLinked: number;
  jobsCreated: number;
  /** Per-rule fire counter for Stage-1 deterministic matches. */
  rulesFired: Record<string, number>;
  errorMessage: string | null;
}

function isJobCategory(c: ClassificationResult["category"]): boolean {
  return (JOB_INBOX_CATEGORIES as readonly string[]).includes(c);
}

/** Drizzle's neon-http driver throws `DrizzleQueryError` whose `.message`
 *  is just the query text + params, with the real Postgres/Neon error
 *  hanging off `.cause` (often a `NeonDbError` carrying a `code` SQLSTATE
 *  + `detail`/`hint`). Walking the cause chain so the sync summary
 *  surfaces something actionable ("23503 foreign_key_violation: …")
 *  instead of "Failed query: update …". */
function describeDbError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  let root: Error = err;
  for (let hop = 0; hop < 5; hop++) {
    const next = (root as { cause?: unknown }).cause;
    if (!(next instanceof Error)) break;
    root = next;
  }
  const code = (root as { code?: unknown }).code;
  const detail = (root as { detail?: unknown }).detail;
  const hint = (root as { hint?: unknown }).hint;
  const parts: string[] = [];
  if (typeof code === "string" && code) parts.push(code);
  parts.push(root.message);
  if (typeof detail === "string" && detail) parts.push(`detail: ${detail}`);
  if (typeof hint === "string" && hint) parts.push(`hint: ${hint}`);
  return parts.join(" — ");
}

async function syncAccount(
  deps: SyncDeps,
  account: ExternalEmailAccountRow,
): Promise<SyncSummary> {
  const startedAt = new Date();

  let run: { id: string } | null = null;
  let status: SyncSummary["status"] = "success";
  let errorMessage: string | null = null;
  let synced = 0;
  let classified = 0;
  let excluded = 0;
  let jobRelated = 0;
  let linked = 0;
  let created = 0;
  const rulesFired: Record<string, number> = {};
  const persisted: ExternalEmailMessageRow[] = [];
  const minScore = Number(account.minJobScore ?? "0.5");

  try {
    // Open the run audit row inside the same try/catch as the work itself —
    // if schema drift makes this insert fail (e.g. a 0087 column missing),
    // the route still returns a structured per-account error summary
    // instead of bubbling a 500.
    run = await deps.repos.emailSyncRuns.start({
      userId: account.userId,
      accountId: account.id,
      startedAt,
      status: "running",
    } as any);

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
        const outcome = await persistAndProcess({
          deps,
          account,
          email,
          userRules,
        });
        if (outcome) {
          const { row, classification } = outcome;
          persisted.push(row);
          synced += 1;
          if (row.category) classified += 1;
          if (classification.ruleName) {
            rulesFired[classification.ruleName] = (rulesFired[classification.ruleName] ?? 0) + 1;
          }
          const passed =
            isJobCategory(classification.category) && classification.score >= minScore;
          if (passed) jobRelated += 1;
          else excluded += 1;
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

    // Build the digest off the freshly persisted batch. Skip the LLM
    // call when nothing job-relevant landed — a sync that pulls 30
    // newsletters doesn't need a recap and the call counts toward the
    // Cloudflare Workers per-invocation subrequest budget (see #714).
    const digestSummary =
      jobRelated > 0
        ? await buildSyncDigest({ llm: deps.llm }, persisted)
        : null;

    await deps.repos.emailSyncRuns.patch(run.id, {
      completedAt: new Date(),
      status,
      messagesSynced: synced,
      messagesClassified: classified,
      messagesExcluded: excluded,
      messagesJobRelated: jobRelated,
      jobsLinked: linked,
      jobsCreated: created,
      rulesFired,
      digestSummary: digestSummary ?? undefined,
    } as any);
  } catch (err) {
    status = "error";
    errorMessage = describeDbError(err);
    console.error(`[email-sync] account ${account.id} sync failed:`, err);
    // Diagnostic writes — wrap each in its own try/catch so a follow-up DB
    // failure (e.g. mid-migration schema drift, transient Neon error)
    // doesn't cascade into a 500 from the manual-sync route. The summary
    // we return at the bottom captures `status: "error"` either way.
    const safeError = errorMessage.slice(0, 8000);
    try {
      await deps.repos.externalEmailAccounts.patch(account.id, account.userId, {
        status: "error",
        lastError: safeError,
      } as any);
    } catch (writeErr) {
      console.error(`[email-sync] failed to record error on account ${account.id}:`, writeErr);
    }
    if (run) {
      try {
        await deps.repos.emailSyncRuns.patch(run.id, {
          completedAt: new Date(),
          status: "error",
          errorMessage: safeError,
        } as any);
      } catch (writeErr) {
        console.error(`[email-sync] failed to record run failure ${run.id}:`, writeErr);
      }
    }
  }

  return {
    accountId: account.id,
    status,
    messagesSynced: synced,
    messagesClassified: classified,
    messagesExcluded: excluded,
    messagesJobRelated: jobRelated,
    jobsLinked: linked,
    jobsCreated: created,
    rulesFired,
    errorMessage,
  };
}

interface PersistArgs {
  deps: SyncDeps;
  account: ExternalEmailAccountRow;
  email: NormalisedEmail;
  userRules: Awaited<ReturnType<Repos["emailUserRules"]["findEnabledForUser"]>>;
}

interface PersistOutcome {
  row: ExternalEmailMessageRow;
  classification: ClassificationResult;
}

async function persistAndProcess(args: PersistArgs): Promise<PersistOutcome | null> {
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
  // classification + dedup populated, skip the work. We still need to
  // report the classification to the caller for the per-run summary —
  // reconstruct it from the persisted row.
  if (row.category && (row.linkedJobId || row.dedupScore != null)) {
    return {
      row,
      classification: {
        category: row.category as ClassificationResult["category"],
        score: row.score == null ? 0 : Number(row.score),
        source: "default_rule",
      },
    };
  }

  const classification = await classifyEmail({ llm: deps.llm }, email, userRules);
  const summary = await summariseEmail({ llm: deps.llm }, email, classification);
  const applyUrls = extractApplyUrls(email);
  const applyUrl = applyUrls[0] ?? null;

  // Skip dedup + auto-create for non-job-related categories.
  let linkedJobId: string | null = null;
  let dedupScore: number | null = null;
  let dedupMethod: string | null = null;

  const isJobRelated = isJobCategory(classification.category);

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

  const patchedRow: ExternalEmailMessageRow = {
    ...row,
    category: classification.category,
    score: String(classification.score),
    summary,
    applyUrl,
    linkedJobId,
    dedupScore: dedupScore == null ? null : String(dedupScore),
    dedupMethod,
  } as ExternalEmailMessageRow;

  return { row: patchedRow, classification };
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

/** User-driven manual sync. When `accountIds` is empty/undefined, syncs
 *  every active account on the user. Otherwise filters to the supplied
 *  subset — used by the per-mailbox checkbox UI in Settings → Email →
 *  Inboxes so users can pull only the mailboxes they care about right
 *  now (cheap on Gmail quota, predictable on LLM cost). */
export async function syncSelectedAccountsForUser(
  deps: SyncDeps,
  userId: string,
  accountIds?: string[],
): Promise<SyncSummary[]> {
  const accounts = await deps.repos.externalEmailAccounts.findActiveForUser(userId);
  const wanted =
    accountIds && accountIds.length > 0
      ? accounts.filter((a) => accountIds.includes(a.id))
      : accounts;
  const summaries: SyncSummary[] = [];
  for (const account of wanted) {
    summaries.push(await syncAccount(deps, account));
  }
  return summaries;
}
