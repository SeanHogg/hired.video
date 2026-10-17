/**
 * Recruiter Agent v2 follow-up worker.
 *
 * Selects rows from recruiter_agent_followups where status='pending'
 * and scheduled_for <= now(). For each, materialises a row in
 * candidate_interactions (type='follow_up', subject=…, body=…) so the
 * recruiter sees the surfaced reminder in their candidate-interactions
 * feed, then flips the followup row to status='sent'.
 *
 * We don't auto-send to the candidate at this stage — the worker only
 * surfaces the reminder; the recruiter chooses how to dispatch
 * (email, LinkedIn, phone). Auto-send via the messaging service can
 * layer on top once Comm Hub channel routing is firm.
 *
 * Dispatched by the /15 interval cron while the `recruiter-agent-followups`
 * KV marker is due (set by the route that schedules follow-ups), so an
 * empty queue costs no DB query at all.
 */

import { and, asc, eq, lte, sql } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";
import type { WorkerDefinition, WorkerRunContext } from "./types.js";

const BATCH_SIZE = 50;
const FIVE_MINUTES_MS = 5 * 60 * 1000;

export interface FollowupRow {
  id: string;
  runId: string;
  recruiterId: string;
  candidateId: string;
  followupKind: string;
  sequenceIndex: number;
  scheduledFor: Date;
  body: string;
  status: string;
}

/** Fetch the next batch of due, pending follow-ups, oldest first. */
async function fetchPendingBatch(limit: number): Promise<FollowupRow[]> {
  const db = getDb();
  const t = (schema as any).recruiterAgentFollowups;
  if (!t) return [];
  return db
    .select({
      id: t.id,
      runId: t.runId,
      recruiterId: t.recruiterId,
      candidateId: t.candidateId,
      followupKind: t.followupKind,
      sequenceIndex: t.sequenceIndex,
      scheduledFor: t.scheduledFor,
      body: t.body,
      status: t.status,
    })
    .from(t)
    .where(and(eq(t.status, "pending"), lte(t.scheduledFor, new Date())))
    .orderBy(asc(t.scheduledFor))
    .limit(limit)
    .catch(() => []);
}

export async function processFollowup(
  ctx: WorkerRunContext,
  row: FollowupRow,
): Promise<void> {
  const db = getDb();
  const followupsTable = (schema as any).recruiterAgentFollowups;
  const interactionsTable = (schema as any).candidateInteractions;
  if (!followupsTable) {
    ctx.recordFailure(row.id, "recruiter_agent_followups table missing");
    return;
  }
  ctx.recordScanned();

  try {
    if (interactionsTable) {
      await db.insert(interactionsTable).values({
        recruiterId: row.recruiterId,
        candidateId: row.candidateId,
        type: "follow_up",
        subject: `Agent follow-up #${row.sequenceIndex} — ${row.followupKind}`,
        notes: row.body,
        interactionDate: new Date(),
        requiresFollowUp: false,
        metadata: {
          source: "recruiter_agent_followup",
          runId: row.runId,
          sequenceIndex: row.sequenceIndex,
        },
      });
    }
    await db
      .update(followupsTable)
      .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
      .where(eq(followupsTable.id, row.id));
    ctx.recordChanged();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.recordFailure(row.id, message);
  }
}

async function run(ctx: WorkerRunContext): Promise<void> {
  const batch = await fetchPendingBatch(BATCH_SIZE);
  for (const row of batch) {
    await processFollowup(ctx, row);
  }
}

export const recruiterAgentFollowupWorker: WorkerDefinition = {
  name: "recruiter-agent-followup",
  displayName: "Recruiter Agent Follow-ups",
  description:
    "Surfaces scheduled AI Recruiter Agent follow-ups into the recruiter's " +
    "candidate-interactions feed when their due time arrives. Idempotent — " +
    "rows are atomically flipped to status='sent' so a retry can't double-fire.",
  cadenceMs: FIVE_MINUTES_MS,
  batchSize: BATCH_SIZE,
  workQueue: "recruiter-agent-followups",
  run,
};

// Internal: tests need a way to drive the worker without going through
// the registry. Re-export the fetch + process so a test can stub a row.
export const __internals = { fetchPendingBatch, processFollowup };
