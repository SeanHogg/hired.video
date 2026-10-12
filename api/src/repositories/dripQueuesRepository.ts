/**
 * DripQueuesRepository — data access for the /5 cron's queue processors:
 * follow-up nurture drips, recruiter outreach sequences, and the generic
 * `queue_job_to_process` background queue (see services/outreach/
 * drip-processors.ts and services/queue/job-queue-processor.ts).
 *
 * Shaped for batching: step lookups are prefetched for every due sequence
 * in one query, and status transitions that don't follow a send are
 * applied with one `inArray` UPDATE instead of one per row.
 */

import { and, asc, eq, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { schema } from "../db/index.js";

const {
  followUpEnrollments,
  followUpSequences,
  followUpSteps,
  followUpLogs,
  recruiterOutreachEnrollments,
  recruiterOutreachSequences,
  talentPoolCandidates,
  candidateInteractions,
  queueJobToProcess,
} = schema;

export type DbLike = any;

export type FollowUpEnrollmentRow = typeof followUpEnrollments.$inferSelect;
export type FollowUpSequenceRow = typeof followUpSequences.$inferSelect;
export type FollowUpStepRow = typeof followUpSteps.$inferSelect;
export type FollowUpLogInsert = typeof followUpLogs.$inferInsert;
export type RecruiterOutreachEnrollmentRow = typeof recruiterOutreachEnrollments.$inferSelect;
export type RecruiterOutreachSequenceRow = typeof recruiterOutreachSequences.$inferSelect;
export type CandidateInteractionInsert = typeof candidateInteractions.$inferInsert;
export type QueueJobRow = typeof queueJobToProcess.$inferSelect;

export interface DueFollowUp {
  enrollment: FollowUpEnrollmentRow;
  sequence: FollowUpSequenceRow;
}

export interface DueOutreach {
  enrollment: RecruiterOutreachEnrollmentRow;
  sequence: RecruiterOutreachSequenceRow;
  candidateEmail: string | null;
  candidateName: string | null;
  candidateCompany: string | null;
}

export class DripQueuesRepository {
  constructor(private readonly db: DbLike) {}

  // ── Follow-up nurture drips ───────────────────────────────────────────────

  async listDueFollowUps(now: Date, limit: number): Promise<DueFollowUp[]> {
    return this.db
      .select({ enrollment: followUpEnrollments, sequence: followUpSequences })
      .from(followUpEnrollments)
      .innerJoin(followUpSequences, eq(followUpEnrollments.sequenceId, followUpSequences.id))
      .where(
        and(
          eq(followUpEnrollments.status, "active"),
          isNotNull(followUpEnrollments.nextSendAt),
          lte(followUpEnrollments.nextSendAt, now),
        ),
      )
      .limit(limit);
  }

  /** Every step of every listed sequence, keyed `sequenceId → stepOrder → step`
   *  (ONE query; replaces two per-enrollment step SELECTs). When a sequence
   *  has duplicate stepOrders the first row returned wins, matching the old
   *  `.limit(1)` read. */
  async findStepsBySequence(sequenceIds: string[]): Promise<Map<string, Map<number, FollowUpStepRow>>> {
    const out = new Map<string, Map<number, FollowUpStepRow>>();
    const unique = [...new Set(sequenceIds)];
    if (unique.length === 0) return out;
    const rows: FollowUpStepRow[] = await this.db
      .select()
      .from(followUpSteps)
      .where(inArray(followUpSteps.sequenceId, unique));
    for (const step of rows) {
      const bySeq = out.get(step.sequenceId) ?? new Map<number, FollowUpStepRow>();
      if (!bySeq.has(step.stepOrder)) bySeq.set(step.stepOrder, step);
      out.set(step.sequenceId, bySeq);
    }
    return out;
  }

  async setFollowUpEnrollmentsStatus(
    ids: string[],
    status: "completed" | "unsubscribed",
    now: Date,
  ): Promise<void> {
    if (ids.length === 0) return;
    await this.db
      .update(followUpEnrollments)
      .set(status === "completed" ? { status, completedAt: now, updatedAt: now } : { status, updatedAt: now })
      .where(inArray(followUpEnrollments.id, ids));
  }

  async insertFollowUpLog(row: FollowUpLogInsert): Promise<void> {
    await this.db.insert(followUpLogs).values(row);
  }

  async advanceFollowUpEnrollment(
    id: string,
    patch: { currentStep: number; nextSendAt: Date | null; completed: boolean },
    now: Date,
  ): Promise<void> {
    await this.db
      .update(followUpEnrollments)
      .set({
        currentStep: patch.currentStep,
        nextSendAt: patch.nextSendAt ?? undefined,
        status: patch.completed ? "completed" : "active",
        completedAt: patch.completed ? now : undefined,
        updatedAt: now,
      })
      .where(eq(followUpEnrollments.id, id));
  }

  // ── Recruiter outreach ────────────────────────────────────────────────────

  async listDueOutreach(now: Date, limit: number): Promise<DueOutreach[]> {
    return this.db
      .select({
        enrollment: recruiterOutreachEnrollments,
        sequence: recruiterOutreachSequences,
        candidateEmail: talentPoolCandidates.candidateEmail,
        candidateName: talentPoolCandidates.candidateName,
        candidateCompany: talentPoolCandidates.currentCompany,
      })
      .from(recruiterOutreachEnrollments)
      .innerJoin(
        recruiterOutreachSequences,
        eq(recruiterOutreachEnrollments.sequenceId, recruiterOutreachSequences.id),
      )
      .innerJoin(
        talentPoolCandidates,
        eq(recruiterOutreachEnrollments.talentPoolCandidateId, talentPoolCandidates.id),
      )
      .where(
        and(
          eq(recruiterOutreachEnrollments.status, "active"),
          isNotNull(recruiterOutreachEnrollments.nextSendAt),
          lte(recruiterOutreachEnrollments.nextSendAt, now),
        ),
      )
      .limit(limit);
  }

  async completeOutreachEnrollments(ids: string[], now: Date): Promise<void> {
    if (ids.length === 0) return;
    await this.db
      .update(recruiterOutreachEnrollments)
      .set({ status: "completed", completedAt: now })
      .where(inArray(recruiterOutreachEnrollments.id, ids));
  }

  async advanceOutreachEnrollment(
    id: string,
    patch: { currentStep: number; nextSendAt: Date | null; completed: boolean },
    now: Date,
  ): Promise<void> {
    await this.db
      .update(recruiterOutreachEnrollments)
      .set({
        currentStep: patch.currentStep,
        nextSendAt: patch.nextSendAt ?? undefined,
        status: patch.completed ? "completed" : "active",
        completedAt: patch.completed ? now : undefined,
      })
      .where(eq(recruiterOutreachEnrollments.id, id));
  }

  /** Best-effort multi-row insert of timeline interactions; a failed batch
   *  is retried per row so one bad row can't drop the rest. Never throws. */
  async insertCandidateInteractions(rows: CandidateInteractionInsert[]): Promise<void> {
    if (rows.length === 0) return;
    try {
      await this.db.insert(candidateInteractions).values(rows);
    } catch {
      for (const row of rows) {
        await this.db.insert(candidateInteractions).values(row).catch(() => undefined);
      }
    }
  }

  // ── Generic background job queue ──────────────────────────────────────────

  async listPendingJobs(limit: number): Promise<QueueJobRow[]> {
    return this.db
      .select()
      .from(queueJobToProcess)
      .where(
        and(
          eq(queueJobToProcess.status, "pending"),
          lte(queueJobToProcess.attempts, sql`${queueJobToProcess.maxAttempts} - 1`),
        ),
      )
      .orderBy(asc(queueJobToProcess.priority), asc(queueJobToProcess.createdAt))
      .limit(limit);
  }

  async markJobProcessing(id: string, attempts: number, now: Date): Promise<void> {
    await this.db
      .update(queueJobToProcess)
      .set({ status: "processing", attempts, lastAttemptAt: now, updatedAt: now })
      .where(eq(queueJobToProcess.id, id));
  }

  async markJobsCompleted(ids: string[], now: Date): Promise<void> {
    if (ids.length === 0) return;
    await this.db
      .update(queueJobToProcess)
      .set({ status: "completed", completedAt: now, updatedAt: now })
      .where(inArray(queueJobToProcess.id, ids));
  }

  async markJobFailedAttempt(id: string, failed: boolean, error: string, now: Date): Promise<void> {
    await this.db
      .update(queueJobToProcess)
      .set({
        status: failed ? "failed" : "pending",
        error,
        failedAt: failed ? now : undefined,
        updatedAt: now,
      })
      .where(eq(queueJobToProcess.id, id));
  }
}
