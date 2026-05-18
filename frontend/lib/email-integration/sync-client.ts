/**
 * Client-driven email sync orchestrator — the only path connected
 * mailboxes use. Runs entirely in the PWA (no Service Worker yet;
 * tab-focus / button-driven sync — gap #758 will add `periodicSync`).
 *
 * Why client-driven (see Gap Register #755 + #757):
 *   A server-side sweep hits Cloudflare Workers' 50-subrequest
 *   per-invocation budget when fanning out across multiple mailboxes.
 *   The browser has no such cap — it pulls direct from
 *   gmail.googleapis.com / graph.microsoft.com, then POSTs the
 *   normalised batch to the server in 5-row chunks. Each chunk is a
 *   fresh Worker invocation with its own budget, so LLM Stage-2 +
 *   dedup + persist amortises across many invocations instead of
 *   clipping mid-sweep. The old server-side cron sweep was deleted
 *   under #757 because the dual-path setup kept re-creating the same
 *   budget bug whenever the cron path ran.
 *
 *   Chunk size dropped from 25 → 5 on 2026-05-17 after a real-world
 *   sync (14 messages) tripped the 1000-subrequest cap mid-ingest —
 *   each message fans out into rules-fired + ledger + LLM + dedup
 *   writes (~70 subrequests / message), so 25 messages × 70 calls
 *   blew the budget. Real fix (bulk DB writes) is gap #811 + #815.
 *
 * Flow per connected mailbox:
 *   1. GET /accounts/:id/access-token  → short-lived bearer
 *   2. provider.pullDelta(auth, cursor) → NormalisedEmail[] direct from Gmail/Outlook
 *   3. Stage-1 rules client-side (shared module → zero server hop)
 *   4. POST /inbox/external-emails/ingest in chunks of CHUNK_SIZE —
 *      server runs LLM Stage-2 only for un-classified-by-rules
 *      messages, plus dedup + persist
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
import type { InboxAccount } from "@/hooks/use-comm-hub";

const PROVIDERS: Record<string, EmailProvider> = {
  gmail: gmailProvider,
  outlook: outlookProvider,
};

// 20 is the new ceiling now that #815 landed — the server-side ingest
// pipeline batches every DB op (insert / patch / dedup-context load) so
// per-chunk subrequests are flat in N for the DB side, only the LLM
// calls scale 2N. At 20 messages that's still well under the Cloudflare
// Worker 1000-subrequest cap with margin to spare for retries. The
// server still enforces a hard 25 in `services/email-integration/ingest.ts`
// (`MAX_CHUNK_SIZE`) so bumping past 25 here would 400 the chunk.
const CHUNK_SIZE = 20;
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
  phase: "auth" | "pull" | "ingest";
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
  try {
    const r = await apiClient.get<UserRule[]>("/api/integrations/email/rules");
    return r.data ?? [];
  } catch {
    return [];
  }
}

async function ingestChunk(
  accountId: string,
  messages: Array<NormalisedEmail & { clientCategory?: string; clientScore?: number; clientRuleName?: string }>,
  nextCursor: string | null,
): Promise<IngestResp> {
  const r = await apiClient.post<IngestResp>(
    "/api/inbox/external-emails/ingest",
    { accountId, messages, nextCursor },
  );
  if (!r.data) throw new Error("Ingest returned no body");
  return r.data;
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

  try {
    onProgress?.({ accountId: account.id, phase: "auth", ingested: 0, total: 0 });
    const token = await fetchAccessToken(account.id);

    const provider = PROVIDERS[account.provider];
    if (!provider) throw new Error(`Unknown provider: ${account.provider}`);

    onProgress?.({ accountId: account.id, phase: "pull", ingested: 0, total: 0 });
    // First sync resumes from server-stored cursor; the server stamps
    // the next cursor onto the account row on each ingest, so the
    // client can stay stateless. NULL cursor = initial backfill.
    const { messages, nextCursor } = await provider.pullDelta(
      { accessToken: token.accessToken },
      { cursor: null, backfillLimit: BACKFILL_LIMIT },
    );
    summary.messagesFetched = messages.length;

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
    // LLM Stage-2 + dedup subrequest budget resets between batches.
    let cursorToPersist: string | null = nextCursor;
    for (let i = 0; i < tagged.length; i += CHUNK_SIZE) {
      const chunk = tagged.slice(i, i + CHUNK_SIZE);
      // Only attach the cursor to the LAST chunk so an interrupted
      // sync doesn't advance the cursor past unprocessed messages.
      const isLastChunk = i + CHUNK_SIZE >= tagged.length;
      try {
        const resp = await ingestChunk(
          account.id,
          chunk,
          isLastChunk ? cursorToPersist : null,
        );
        summary.messagesIngested += resp.messagesIngested;
        summary.messagesExcluded += resp.messagesExcluded;
        summary.messagesJobRelated += resp.messagesJobRelated;
        summary.jobsLinked += resp.jobsLinked;
        summary.jobsCreated += resp.jobsCreated;
        for (const [rule, count] of Object.entries(resp.rulesFired)) {
          summary.rulesFired[rule] = (summary.rulesFired[rule] ?? 0) + count;
        }
        if (resp.errorMessage) summary.status = "partial";
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
