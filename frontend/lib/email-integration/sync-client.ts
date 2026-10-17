/**
 * Client-driven email sync orchestrator — the only path connected
 * mailboxes use. Runs entirely in the PWA (no Service Worker yet;
 * tab-focus / button-driven sync — gap #758 will add `periodicSync`).
 *
 * Why client-driven (see Gap Register #755 + #757):
 *   A server-side sweep hits Cloudflare Workers' per-invocation
 *   subrequest budget (50 on Bundled, 1000 on Unbound) when fanning
 *   out across multiple mailboxes. The browser has no such cap — it
 *   pulls direct from gmail.googleapis.com / graph.microsoft.com,
 *   then POSTs the normalised batch to the server in CHUNK_SIZE-row
 *   chunks. Each chunk is a fresh Worker invocation with its own
 *   budget, so LLM Stage-2 + dedup + persist amortises across many
 *   invocations instead of clipping mid-sweep. The old server-side
 *   cron sweep was deleted under #757 because the dual-path setup
 *   kept re-creating the same budget bug whenever the cron path ran.
 *
 *   Two trips per logical sync now live on the server (gap #826):
 *     • N × POST /external-emails/ingest — persist + classify only.
 *     • 1 × POST /external-emails/finalize — sync-run audit + cursor
 *       advance + metering. Splitting the trailing writes off the
 *       chunk loop keeps each ingest invocation well under the
 *       Bundled-Worker budget even when summarise + classify LLM
 *       calls eat 2N subrequests on top of the DB writes.
 *
 *   Chunk size history:
 *     • 25 → 5 on 2026-05-17 after a 14-message real sync tripped
 *       the budget (per-message DB fan-out, fixed by #815).
 *     • 5 → 20 on 2026-05-17 after #815 collapsed DB ops into 3
 *       fixed calls per chunk.
 *     • 20 → 10 on 2026-05-18 after the budget tripped again
 *       (summariseEmail running on every message, fixed by #826).
 *
 * Flow per connected mailbox:
 *   1. GET /accounts/:id/access-token  → short-lived bearer
 *   2. provider.pullDelta(auth, cursor) → NormalisedEmail[] direct from Gmail/Outlook
 *   3. Stage-1 rules client-side (shared module → zero server hop)
 *   4. POST /inbox/external-emails/ingest in chunks of CHUNK_SIZE —
 *      server runs LLM Stage-2 only for un-classified-by-rules
 *      messages, plus dedup + persist
 *   5. POST /inbox/external-emails/finalize once with the aggregate
 *      counters + the new provider cursor.
 */

import {
  classifyByRules,
  type ClassificationResult,
  type UserRule,
} from "@shared/email-classification/index.ts";
import { gmailProvider } from "@shared/email-providers/gmail.ts";
import { outlookProvider } from "@shared/email-providers/outlook.ts";
import type {
  EmailProvider,
  NormalisedEmail,
} from "@shared/email-providers/types.ts";
import { apiClient } from "@/lib/api-client";
import { emailIntegrationService } from "@/lib/services/email-integration-service";
import type { InboxAccount } from "@/hooks/use-comm-hub";

const PROVIDERS: Record<string, EmailProvider> = {
  gmail: gmailProvider,
  outlook: outlookProvider,
};

// 10 is the new ceiling after gap #826 — even with per-row LLM
// classify + summary the Bundled-Worker 50-subrequest cap stays out
// of reach (≈ 3 fixed + 1 insert + ≤10 classify + ≤10 summarise + 1
// patch ≈ ≤25). The trailing sync-run audit + cursor advance now
// live on a separate /finalize call with its own budget.
const CHUNK_SIZE = 10;
const BACKFILL_LIMIT = 30;

interface AccessTokenResp {
  accessToken: string;
  expiresAt: string;
  provider: string;
  accountEmail: string;
}

interface IngestResp {
  accountId: string;
  messagesIngested: number;
  messagesExcluded: number;
  messagesJobRelated: number;
  jobsLinked: number;
  jobsCreated: number;
  rulesFired: Record<string, number>;
  errorMessage: string | null;
}

interface FinalizeResp {
  accountId: string;
  syncSessionId: string;
  cursorAdvanced: boolean;
  errorMessage: string | null;
}

export interface ClientSyncSummary {
  accountId: string;
  accountLabel: string;
  status: "success" | "partial" | "error";
  messagesFetched: number;
  messagesIngested: number;
  messagesJobRelated: number;
  messagesExcluded: number;
  jobsLinked: number;
  jobsCreated: number;
  rulesFired: Record<string, number>;
  errorMessage: string | null;
}

export interface ClientSyncProgress {
  accountId: string;
  phase: "auth" | "pull" | "ingest" | "finalize";
  ingested: number;
  total: number;
}

async function fetchAccessToken(accountId: string): Promise<AccessTokenResp> {
  const r = await apiClient.get<AccessTokenResp>(
    `/api/integrations/email/accounts/${accountId}/access-token`,
  );
  if (!r.data) throw new Error("Failed to fetch access token");
  return r.data;
}

async function fetchUserRules(): Promise<UserRule[]> {
  return emailIntegrationService.listRules().catch(() => []);
}

async function ingestChunk(
  accountId: string,
  messages: Array<NormalisedEmail & { clientCategory?: string; clientScore?: number; clientRuleName?: string }>,
): Promise<IngestResp> {
  const r = await apiClient.post<IngestResp>(
    "/api/inbox/external-emails/ingest",
    { accountId, messages },
  );
  if (!r.data) throw new Error("Ingest returned no body");
  return r.data;
}

async function finalizeSync(
  accountId: string,
  syncSessionId: string,
  nextCursor: string | null,
  aggregate: {
    messagesIngested: number;
    messagesExcluded: number;
    messagesJobRelated: number;
    jobsLinked: number;
    jobsCreated: number;
    rulesFired: Record<string, number>;
    status: "success" | "partial" | "error";
    errorMessage: string | null;
  },
): Promise<FinalizeResp> {
  const r = await apiClient.post<FinalizeResp>(
    "/api/inbox/external-emails/finalize",
    { accountId, syncSessionId, nextCursor, aggregate },
  );
  if (!r.data) throw new Error("Finalize returned no body");
  return r.data;
}

/** Generate a per-logical-sync UUID stamped on the finalize call so
 *  the server can write one `email_sync_runs` row per logical sync
 *  (gap #811). `crypto.randomUUID()` is universally available in
 *  the browsers we ship to. */
function newSyncSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Worst-case fallback for ancient browsers — the server only
  // requires uniqueness per (accountId, syncSessionId), so a
  // time-prefixed random suffix is fine.
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Minimal account shape `runClientSync` needs. Both `InboxAccount`
 *  (from `useCommHub`) and `ConnectedEmailAccount` (from the Settings
 *  page service) already satisfy this — using a structural Pick
 *  decouples the orchestrator from either consumer's full type. */
export type SyncableAccount = Pick<
  InboxAccount,
  "id" | "provider" | "accountEmail" | "accountLabel" | "status"
>;

/** Sync a single connected mailbox. */
async function syncAccount(
  account: SyncableAccount,
  userRules: UserRule[],
  onProgress?: (p: ClientSyncProgress) => void,
): Promise<ClientSyncSummary> {
  const label = account.accountLabel?.trim() || account.accountEmail;
  // One session id for the whole logical sync — the finalize call
  // below stamps it so the server writes one Sync History row.
  const syncSessionId = newSyncSessionId();
  const summary: ClientSyncSummary = {
    accountId: account.id,
    accountLabel: label,
    status: "success",
    messagesFetched: 0,
    messagesIngested: 0,
    messagesJobRelated: 0,
    messagesExcluded: 0,
    jobsLinked: 0,
    jobsCreated: 0,
    rulesFired: {},
    errorMessage: null,
  };
  let pulledCursor: string | null = null;

  try {
    onProgress?.({ accountId: account.id, phase: "auth", ingested: 0, total: 0 });
    const token = await fetchAccessToken(account.id);

    const provider = PROVIDERS[account.provider];
    if (!provider) throw new Error(`Unknown provider: ${account.provider}`);

    onProgress?.({ accountId: account.id, phase: "pull", ingested: 0, total: 0 });
    // First sync resumes from server-stored cursor; the server stamps
    // the next cursor onto the account row on each finalize, so the
    // client can stay stateless. NULL cursor = initial backfill.
    const { messages, nextCursor } = await provider.pullDelta(
      { accessToken: token.accessToken },
      { cursor: null, backfillLimit: BACKFILL_LIMIT },
    );
    summary.messagesFetched = messages.length;
    pulledCursor = nextCursor;

    // Stage-1 classification in the browser — most messages match
    // rules and don't need the server's LLM hop. The same shared rules
    // run server-side too; the server confirms before trusting the
    // hint.
    const tagged = messages.map((m) => {
      const cls: ClassificationResult | null = classifyByRules(m, userRules);
      return {
        ...m,
        clientCategory: cls?.category,
        clientScore: cls?.score,
        clientRuleName: cls?.ruleName,
      };
    });

    onProgress?.({
      accountId: account.id,
      phase: "ingest",
      ingested: 0,
      total: tagged.length,
    });

    // Chunk + POST. Each chunk is its own Worker invocation so the
    // LLM Stage-2 + summary subrequest budget resets between batches.
    for (let i = 0; i < tagged.length; i += CHUNK_SIZE) {
      const chunk = tagged.slice(i, i + CHUNK_SIZE);
      try {
        const resp = await ingestChunk(account.id, chunk);
        summary.messagesIngested += resp.messagesIngested;
        summary.messagesExcluded += resp.messagesExcluded;
        summary.messagesJobRelated += resp.messagesJobRelated;
        summary.jobsLinked += resp.jobsLinked;
        summary.jobsCreated += resp.jobsCreated;
        for (const [rule, count] of Object.entries(resp.rulesFired)) {
          summary.rulesFired[rule] = (summary.rulesFired[rule] ?? 0) + count;
        }
        if (resp.errorMessage) {
          summary.status = "partial";
          summary.errorMessage = resp.errorMessage;
        }
      } catch (err) {
        summary.status = "partial";
        summary.errorMessage = err instanceof Error ? err.message : String(err);
      }
      onProgress?.({
        accountId: account.id,
        phase: "ingest",
        ingested: Math.min(i + CHUNK_SIZE, tagged.length),
        total: tagged.length,
      });
    }
  } catch (err) {
    summary.status = "error";
    summary.errorMessage = err instanceof Error ? err.message : String(err);
  }

  // Finalize: write the sync-run audit row, advance the provider
  // cursor, and meter the logical sync. Best-effort — a failure here
  // doesn't undo the ingest work; it just leaves the cursor pinned so
  // the next sync re-pulls (already-classified rows skip Stage-2 on
  // the server-side idempotency check).
  try {
    onProgress?.({
      accountId: account.id,
      phase: "finalize",
      ingested: summary.messagesIngested,
      total: summary.messagesFetched,
    });
    const fin = await finalizeSync(
      account.id,
      syncSessionId,
      pulledCursor,
      {
        messagesIngested: summary.messagesIngested,
        messagesExcluded: summary.messagesExcluded,
        messagesJobRelated: summary.messagesJobRelated,
        jobsLinked: summary.jobsLinked,
        jobsCreated: summary.jobsCreated,
        rulesFired: summary.rulesFired,
        status: summary.status,
        errorMessage: summary.errorMessage,
      },
    );
    if (fin.errorMessage) {
      summary.status = summary.status === "error" ? "error" : "partial";
      summary.errorMessage = summary.errorMessage
        ? `${summary.errorMessage}; ${fin.errorMessage}`
        : fin.errorMessage;
    }
  } catch (err) {
    summary.status = summary.status === "error" ? "error" : "partial";
    const msg = err instanceof Error ? err.message : String(err);
    summary.errorMessage = summary.errorMessage
      ? `${summary.errorMessage}; finalize: ${msg}`
      : `finalize: ${msg}`;
  }

  return summary;
}

export interface ClientSyncOptions {
  accountIds?: string[];
  onProgress?: (p: ClientSyncProgress) => void;
}

/** Sync every active connected mailbox (or only the ones listed) via
 *  the client-driven path. The result shape mirrors the per-run
 *  summary used by the InboxToolbar so the rollup renders the same. */
export async function runClientSync(
  accounts: SyncableAccount[],
  options: ClientSyncOptions = {},
): Promise<ClientSyncSummary[]> {
  const targets = accounts.filter(
    (a) =>
      a.status === "active" &&
      (!options.accountIds || options.accountIds.includes(a.id)),
  );
  if (targets.length === 0) return [];

  const userRules = await fetchUserRules();

  const summaries: ClientSyncSummary[] = [];
  for (const account of targets) {
    summaries.push(await syncAccount(account, userRules, options.onProgress));
  }
  return summaries;
}
