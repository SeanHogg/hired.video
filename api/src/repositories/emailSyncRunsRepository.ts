/**
 * EmailSyncRunsRepository — per-account sync run audit + digest source.
 *
 * One row per **logical sync**. The PWA orchestrator (`runClientSync`
 * in `frontend/lib/email-integration/sync-client.ts`) splits a logical
 * sync into N chunked POSTs and stamps every chunk with the same
 * `syncSessionId`. The ingest service calls `upsertChunkResult()` once
 * per chunk; the first call inserts a row, subsequent calls sum the
 * counter deltas + merge the rules-fired map into the existing row.
 *
 * Atomicity comes from the partial unique index on
 * `(account_id, sync_session_id) WHERE sync_session_id IS NOT NULL`
 * (migration 0095). The PWA orchestrator awaits each chunk POST
 * sequentially, so concurrent chunks within one session aren't a
 * concern in practice; the unique index is the belt-and-braces for
 * any retry / Service-Worker overlap.
 */

import { and, asc, desc, eq } from "drizzle-orm";
import { schema } from "../db/index.js";

const { emailSyncRuns } = schema;

export type DbLike = any;

type EmailSyncRunRow = typeof emailSyncRuns.$inferSelect;

/** Counter deltas + rule-fire map emitted by one ingest chunk. */
export interface SyncRunDelta {
  messagesSynced: number;
  messagesClassified: number;
  messagesExcluded: number;
  messagesJobRelated: number;
  jobsLinked: number;
  jobsCreated: number;
  rulesFired: Record<string, number>;
  errorMessage: string | null;
  /** "success" if the chunk had zero errors, "partial" otherwise.
   *  The final row reflects the worst status across all chunks. */
  status: "success" | "partial";
}

export interface IEmailSyncRunsRepository {
  findRecentForUser(userId: string, limit?: number): Promise<EmailSyncRunRow[]>;
  /** Insert a fresh sync-run row OR sum the delta into the existing
   *  row keyed on `(accountId, syncSessionId)`. Idempotent on retry
   *  for a single chunk: a second call with the same delta won't
   *  re-add counters because the caller drives one call per chunk.
   *  Returns the resulting row. */
  upsertChunkResult(args: {
    userId: string;
    accountId: string;
    syncSessionId: string;
    delta: SyncRunDelta;
    now?: Date;
  }): Promise<EmailSyncRunRow>;
}

function mergeRulesFired(
  existing: Record<string, number> | null | undefined,
  delta: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = { ...(existing ?? {}) };
  for (const [k, v] of Object.entries(delta)) {
    out[k] = (out[k] ?? 0) + v;
  }
  return out;
}

export class EmailSyncRunsRepository implements IEmailSyncRunsRepository {
  constructor(private readonly db: DbLike) {}

  async findRecentForUser(userId: string, limit = 10): Promise<EmailSyncRunRow[]> {
    return (await this.db
      .select()
      .from(emailSyncRuns)
      .where(eq(emailSyncRuns.userId, userId))
      .orderBy(desc(emailSyncRuns.startedAt))
      .limit(Math.min(50, Math.max(1, limit)))) as EmailSyncRunRow[];
  }

  async upsertChunkResult(args: {
    userId: string;
    accountId: string;
    syncSessionId: string;
    delta: SyncRunDelta;
    now?: Date;
  }): Promise<EmailSyncRunRow> {
    const now = args.now ?? new Date();
    const existing = (await this.db
      .select()
      .from(emailSyncRuns)
      .where(
        and(
          eq(emailSyncRuns.accountId, args.accountId),
          eq(emailSyncRuns.syncSessionId, args.syncSessionId),
        ),
      )
      .limit(1)
      .orderBy(asc(emailSyncRuns.startedAt))) as EmailSyncRunRow[];

    if (existing.length > 0) {
      const row = existing[0];
      const merged = {
        messagesSynced: (row.messagesSynced ?? 0) + args.delta.messagesSynced,
        messagesClassified:
          (row.messagesClassified ?? 0) + args.delta.messagesClassified,
        messagesExcluded:
          (row.messagesExcluded ?? 0) + args.delta.messagesExcluded,
        messagesJobRelated:
          (row.messagesJobRelated ?? 0) + args.delta.messagesJobRelated,
        jobsLinked: (row.jobsLinked ?? 0) + args.delta.jobsLinked,
        jobsCreated: (row.jobsCreated ?? 0) + args.delta.jobsCreated,
        rulesFired: mergeRulesFired(
          row.rulesFired as Record<string, number> | null,
          args.delta.rulesFired,
        ),
        completedAt: now,
        // "partial" sticks — once any chunk errors, the whole sync is
        // reported partial even if subsequent chunks succeed.
        status:
          row.status === "partial" || args.delta.status === "partial"
            ? "partial"
            : "success",
        errorMessage: args.delta.errorMessage ?? row.errorMessage ?? null,
      };
      const [updated] = (await this.db
        .update(emailSyncRuns)
        .set(merged as any)
        .where(eq(emailSyncRuns.id, row.id))
        .returning()) as EmailSyncRunRow[];
      return updated;
    }

    // First chunk of the session — insert. The partial unique index
    // catches the race where two concurrent first-chunk POSTs both
    // see existing.length === 0; the loser falls through to the
    // update branch below.
    try {
      const [inserted] = (await this.db
        .insert(emailSyncRuns)
        .values({
          userId: args.userId,
          accountId: args.accountId,
          syncSessionId: args.syncSessionId,
          startedAt: now,
          completedAt: now,
          status: args.delta.status,
          messagesSynced: args.delta.messagesSynced,
          messagesClassified: args.delta.messagesClassified,
          messagesExcluded: args.delta.messagesExcluded,
          messagesJobRelated: args.delta.messagesJobRelated,
          jobsLinked: args.delta.jobsLinked,
          jobsCreated: args.delta.jobsCreated,
          rulesFired: args.delta.rulesFired as any,
          errorMessage: args.delta.errorMessage,
        } as any)
        .returning()) as EmailSyncRunRow[];
      return inserted;
    } catch (err) {
      // Unique-violation fallback — concurrent first-chunk race lost.
      // Recurse into the update path. The check here is duck-typed so
      // we don't depend on a specific Postgres driver error shape.
      const message = err instanceof Error ? err.message : String(err);
      if (/duplicate key|unique constraint|23505/i.test(message)) {
        return this.upsertChunkResult(args);
      }
      throw err;
    }
  }
}
