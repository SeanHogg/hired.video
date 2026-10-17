/** Scorecard SLA scan, escalation routing + interviewer reliability (#1383, #1434). */

import { and, eq, inArray } from "drizzle-orm";
import { schema } from "../../db/index.js";
import type { IScorecardSlaRepository } from "./interfaces.js";
import type {
  DbLike,
  InterviewerReliability,
  OverdueSubmission,
  ScorecardSubmissionRow,
} from "./types.js";

const { scorecardSubmissions, interviewKits, interviewKitStages } = schema;

export class ScorecardSlaRepository implements IScorecardSlaRepository {
  constructor(private readonly db: DbLike) {}

  async findOverdueDraftSubmissions(opts: {
    now: Date;
    remindWithinMs: number;
  }): Promise<OverdueSubmission[]> {
    const horizon = new Date(opts.now.getTime() + opts.remindWithinMs);
    const rows = (await this.db
      .select()
      .from(scorecardSubmissions)
      .where(
        and(
          eq(scorecardSubmissions.status, "draft"),
          // dueAt IS NOT NULL is implicit because dueAt < horizon excludes nulls
          // in Drizzle's translation; we re-assert via the partial-index path.
        ),
      )) as ScorecardSubmissionRow[];
    return rows
      .filter((r) => r.dueAt != null && r.dueAt < horizon)
      .map((r) => ({
        id: r.id,
        templateId: r.templateId,
        evaluatorUserId: r.evaluatorUserId,
        applicationId: r.applicationId,
        candidateUserId: r.candidateUserId,
        kitStageId: r.kitStageId,
        dueAt: r.dueAt!,
        remindedAt: r.remindedAt,
        escalatedAt: r.escalatedAt,
      }));
  }

  async findEscalationRecipients(submissionIds: readonly string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (submissionIds.length === 0) return out;
    const rows: Array<{ id: string; escalateToUserId: string | null }> = await this.db
      .select({ id: scorecardSubmissions.id, escalateToUserId: interviewKits.escalateToUserId })
      .from(scorecardSubmissions)
      .innerJoin(interviewKitStages, eq(interviewKitStages.id, scorecardSubmissions.kitStageId))
      .innerJoin(interviewKits, eq(interviewKits.id, interviewKitStages.kitId))
      .where(inArray(scorecardSubmissions.id, [...submissionIds]));
    for (const r of rows) if (r.escalateToUserId) out.set(r.id, r.escalateToUserId);
    return out;
  }

  async findReliabilityForUser(
    evaluatorUserId: string,
    now: Date,
  ): Promise<InterviewerReliability> {
    const rows = (await this.db
      .select()
      .from(scorecardSubmissions)
      .where(
        eq(scorecardSubmissions.evaluatorUserId, evaluatorUserId),
      )) as ScorecardSubmissionRow[];

    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    let totalWithSla = 0;
    let onTimeCount = 0;
    let lateCount = 0;
    let overdueDraftCount = 0;
    let last30dCount = 0;
    let lagSumMs = 0;
    let lagCount = 0;

    for (const r of rows) {
      const created = r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt);
      if (created >= thirtyDaysAgo) last30dCount++;

      if (r.status === "draft" && r.dueAt != null && r.dueAt < now) {
        overdueDraftCount++;
        continue;
      }
      if (r.status !== "submitted") continue;
      if (r.dueAt == null || r.submittedAt == null) continue;

      const due = r.dueAt instanceof Date ? r.dueAt : new Date(r.dueAt);
      const submitted =
        r.submittedAt instanceof Date ? r.submittedAt : new Date(r.submittedAt);
      const lag = submitted.getTime() - due.getTime();
      totalWithSla++;
      lagSumMs += lag;
      lagCount++;
      if (lag <= 0) onTimeCount++;
      else lateCount++;
    }

    return {
      evaluatorUserId,
      totalWithSla,
      onTimeCount,
      lateCount,
      overdueDraftCount,
      avgLagMs: lagCount > 0 ? Math.round(lagSumMs / lagCount) : null,
      last30dCount,
    };
  }
}
