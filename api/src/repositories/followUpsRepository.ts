/**
 * FollowUpsRepository — nurture drips (/api/followups) on the ONE sequence
 * engine (`follow_up_*`, kind = 'nurture'). Recruiter outreach sequences
 * share the tables but are read/written by outreachSequencesRepository.ts.
 *
 * Covers:
 *   • followUpSequences   — named cadences (e.g. "7-day re-engagement")
 *   • followUpSteps       — per-step template in a sequence
 *   • followUpEnrollments — per-recipient enrollment in a sequence
 *   • followUpLogs        — per-step send log (written by the engine)
 *
 * Reads project away the engine-only columns (`kind`,
 * `talentPoolCandidateId`) so /api/followups responses keep their shape.
 */

import { and, asc, desc, eq, getTableColumns } from "drizzle-orm";
import { schema } from "../db/index.js";

const { followUpSequences, followUpSteps, followUpEnrollments, followUpLogs } = schema;

const KIND = "nurture";

export type DbLike = any;

export type FollowUpStepRow = typeof followUpSteps.$inferSelect;
export type FollowUpStepInsert = typeof followUpSteps.$inferInsert;
export type FollowUpLogRow = typeof followUpLogs.$inferSelect;
export type FollowUpEnrollmentInsert = typeof followUpEnrollments.$inferInsert;

const { kind: _kind, ...sequenceColumns } = getTableColumns(followUpSequences);
const { talentPoolCandidateId: _candidate, ...enrollmentColumns } = getTableColumns(followUpEnrollments);

export type FollowUpSequenceRow = Omit<typeof followUpSequences.$inferSelect, "kind">;
export type FollowUpEnrollmentRow = Omit<typeof followUpEnrollments.$inferSelect, "talentPoolCandidateId">;

export type NewFollowUpStep = Omit<FollowUpStepInsert, "sequenceId" | "id" | "createdAt">;
export type FollowUpEnrollmentStatus = "active" | "paused" | "unsubscribed";

function stripSequence(row: typeof followUpSequences.$inferSelect): FollowUpSequenceRow {
  const { kind: _k, ...rest } = row;
  return rest;
}

function stripEnrollment(row: typeof followUpEnrollments.$inferSelect): FollowUpEnrollmentRow {
  const { talentPoolCandidateId: _c, ...rest } = row;
  return rest;
}

export interface IFollowUpsRepository {
  listSequences(userId: string): Promise<FollowUpSequenceRow[]>;
  findSequence(id: string, userId: string): Promise<FollowUpSequenceRow | null>;
  findActiveSequenceId(userId: string, by: { id: string } | { name: string }): Promise<string | null>;
  insertSequenceWithSteps(
    userId: string,
    input: { name: string; description?: string },
    steps: NewFollowUpStep[],
  ): Promise<FollowUpSequenceRow & { steps: FollowUpStepRow[] }>;
  deleteSequence(id: string): Promise<void>;
  listSteps(sequenceId: string): Promise<FollowUpStepRow[]>;
  firstStepDelayDays(sequenceId: string): Promise<number | null>;
  listEnrollmentsForSequence(sequenceId: string): Promise<FollowUpEnrollmentRow[]>;
  listEnrollmentsForUser(userId: string): Promise<FollowUpEnrollmentRow[]>;
  findEnrollmentId(id: string, userId: string): Promise<string | null>;
  findActiveEnrollmentId(sequenceId: string, recipientEmail: string): Promise<string | null>;
  insertEnrollment(input: FollowUpEnrollmentInsert): Promise<FollowUpEnrollmentRow>;
  setEnrollmentStatus(id: string, status: FollowUpEnrollmentStatus): Promise<FollowUpEnrollmentRow>;
}

export class FollowUpsRepository implements IFollowUpsRepository {
  constructor(private readonly db: DbLike, private readonly now: () => Date = () => new Date()) {}

  async listSequences(userId: string): Promise<FollowUpSequenceRow[]> {
    return this.db
      .select(sequenceColumns)
      .from(followUpSequences)
      .where(and(eq(followUpSequences.userId, userId), eq(followUpSequences.kind, KIND)))
      .orderBy(desc(followUpSequences.createdAt));
  }

  async findSequence(id: string, userId: string): Promise<FollowUpSequenceRow | null> {
    const [row] = await this.db
      .select(sequenceColumns)
      .from(followUpSequences)
      .where(and(eq(followUpSequences.id, id), eq(followUpSequences.userId, userId), eq(followUpSequences.kind, KIND)))
      .limit(1);
    return row ?? null;
  }

  async findActiveSequenceId(userId: string, by: { id: string } | { name: string }): Promise<string | null> {
    const match = "id" in by ? eq(followUpSequences.id, by.id) : eq(followUpSequences.name, by.name);
    const [row] = await this.db
      .select({ id: followUpSequences.id })
      .from(followUpSequences)
      .where(and(match, eq(followUpSequences.userId, userId), eq(followUpSequences.kind, KIND), eq(followUpSequences.isActive, true)))
      .limit(1);
    return row ? row.id : null;
  }

  async insertSequenceWithSteps(
    userId: string,
    input: { name: string; description?: string },
    steps: NewFollowUpStep[],
  ): Promise<FollowUpSequenceRow & { steps: FollowUpStepRow[] }> {
    const [sequence] = await this.db
      .insert(followUpSequences)
      .values({ userId, kind: KIND, name: input.name, description: input.description })
      .returning();
    const stepRows: FollowUpStepRow[] = await this.db
      .insert(followUpSteps)
      .values(steps.map((s) => ({ ...s, sequenceId: sequence.id })))
      .returning();
    return { ...stripSequence(sequence), steps: stepRows };
  }

  async deleteSequence(id: string): Promise<void> {
    await this.db.delete(followUpSequences).where(and(eq(followUpSequences.id, id), eq(followUpSequences.kind, KIND)));
  }

  async listSteps(sequenceId: string): Promise<FollowUpStepRow[]> {
    return this.db
      .select()
      .from(followUpSteps)
      .where(eq(followUpSteps.sequenceId, sequenceId))
      .orderBy(asc(followUpSteps.stepOrder));
  }

  async firstStepDelayDays(sequenceId: string): Promise<number | null> {
    const [row] = await this.db
      .select({ delayDays: followUpSteps.delayDays })
      .from(followUpSteps)
      .where(eq(followUpSteps.sequenceId, sequenceId))
      .orderBy(asc(followUpSteps.stepOrder))
      .limit(1);
    return row ? row.delayDays : null;
  }

  async listEnrollmentsForSequence(sequenceId: string): Promise<FollowUpEnrollmentRow[]> {
    return this.db
      .select(enrollmentColumns)
      .from(followUpEnrollments)
      .where(eq(followUpEnrollments.sequenceId, sequenceId))
      .orderBy(desc(followUpEnrollments.createdAt));
  }

  async listEnrollmentsForUser(userId: string): Promise<FollowUpEnrollmentRow[]> {
    return this.db
      .select(enrollmentColumns)
      .from(followUpEnrollments)
      .innerJoin(followUpSequences, eq(followUpEnrollments.sequenceId, followUpSequences.id))
      .where(and(eq(followUpEnrollments.userId, userId), eq(followUpSequences.kind, KIND)))
      .orderBy(desc(followUpEnrollments.createdAt));
  }

  async findEnrollmentId(id: string, userId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ id: followUpEnrollments.id })
      .from(followUpEnrollments)
      .innerJoin(followUpSequences, eq(followUpEnrollments.sequenceId, followUpSequences.id))
      .where(and(eq(followUpEnrollments.id, id), eq(followUpEnrollments.userId, userId), eq(followUpSequences.kind, KIND)))
      .limit(1);
    return row ? row.id : null;
  }

  async findActiveEnrollmentId(sequenceId: string, recipientEmail: string): Promise<string | null> {
    const [row] = await this.db
      .select({ id: followUpEnrollments.id })
      .from(followUpEnrollments)
      .where(and(
        eq(followUpEnrollments.sequenceId, sequenceId),
        eq(followUpEnrollments.recipientEmail, recipientEmail),
        eq(followUpEnrollments.status, "active"),
      ))
      .limit(1);
    return row ? row.id : null;
  }

  async insertEnrollment(input: FollowUpEnrollmentInsert): Promise<FollowUpEnrollmentRow> {
    const [row] = await this.db.insert(followUpEnrollments).values(input).returning();
    return stripEnrollment(row);
  }

  async setEnrollmentStatus(id: string, status: FollowUpEnrollmentStatus): Promise<FollowUpEnrollmentRow> {
    const [row] = await this.db
      .update(followUpEnrollments)
      .set({ status, updatedAt: this.now() })
      .where(eq(followUpEnrollments.id, id))
      .returning();
    return stripEnrollment(row);
  }
}
