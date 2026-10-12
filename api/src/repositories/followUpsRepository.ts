/**
 * FollowUpsRepository — automated outreach sequence engine.
 *
 * Covers:
 *   • followUpSequences   — named cadences (e.g. "7-day re-engagement")
 *   • followUpSteps       — per-step template in a sequence
 *   • followUpEnrollments — per-user enrollment in a sequence
 *   • followUpLogs        — per-step send log
 *
 * Separate aggregate from Notifications (one-off alerts) and
 * Conversations (two-way exchange) because follow-ups are scheduled,
 * cadence-driven, and fire-and-forget. The write pattern is
 * "enroll → schedule → log send" which has no analog in the other two.
 */

import { desc, eq } from "drizzle-orm";
import { schema } from "../db/index.js";

const { followUpSequences, followUpSteps, followUpEnrollments, followUpLogs } = schema;

export type DbLike = any;

export type FollowUpSequenceRow = typeof followUpSequences.$inferSelect;
export type FollowUpSequenceInsert = typeof followUpSequences.$inferInsert;
export type FollowUpStepRow = typeof followUpSteps.$inferSelect;
export type FollowUpStepInsert = typeof followUpSteps.$inferInsert;
export type FollowUpEnrollmentRow = typeof followUpEnrollments.$inferSelect;
export type FollowUpEnrollmentInsert = typeof followUpEnrollments.$inferInsert;
export type FollowUpLogRow = typeof followUpLogs.$inferSelect;
export type FollowUpLogInsert = typeof followUpLogs.$inferInsert;

export interface IFollowUpsRepository {
  listSequences(): Promise<FollowUpSequenceRow[]>;
  findSequenceById(id: string): Promise<FollowUpSequenceRow | null>;
  insertSequence(input: FollowUpSequenceInsert): Promise<FollowUpSequenceRow>;
  findStepsForSequence(sequenceId: string): Promise<FollowUpStepRow[]>;
  insertStep(input: FollowUpStepInsert): Promise<void>;
  findEnrollmentsForUser(userId: string): Promise<FollowUpEnrollmentRow[]>;
  insertEnrollment(input: FollowUpEnrollmentInsert): Promise<FollowUpEnrollmentRow>;
  findLogsForEnrollment(enrollmentId: string): Promise<FollowUpLogRow[]>;
  insertLog(input: FollowUpLogInsert): Promise<void>;
}

export class FollowUpsRepository implements IFollowUpsRepository {
  constructor(private readonly db: DbLike, private readonly now: () => Date = () => new Date()) {}

  async listSequences(): Promise<FollowUpSequenceRow[]> {
    return (await this.db
      .select()
      .from(followUpSequences)
      .orderBy(desc(followUpSequences.createdAt))) as FollowUpSequenceRow[];
  }

  async findSequenceById(id: string): Promise<FollowUpSequenceRow | null> {
    const [row] = await this.db.select().from(followUpSequences).where(eq(followUpSequences.id, id)).limit(1);
    return (row as FollowUpSequenceRow) ?? null;
  }

  async insertSequence(input: FollowUpSequenceInsert): Promise<FollowUpSequenceRow> {
    const [row] = await this.db.insert(followUpSequences).values(input as any).returning();
    return row as FollowUpSequenceRow;
  }

  async findStepsForSequence(sequenceId: string): Promise<FollowUpStepRow[]> {
    return (await this.db
      .select()
      .from(followUpSteps)
      .where(eq(followUpSteps.sequenceId, sequenceId))) as FollowUpStepRow[];
  }

  async insertStep(input: FollowUpStepInsert): Promise<void> {
    await this.db.insert(followUpSteps).values(input as any);
  }

  async findEnrollmentsForUser(userId: string): Promise<FollowUpEnrollmentRow[]> {
    return (await this.db
      .select()
      .from(followUpEnrollments)
      .where(eq(followUpEnrollments.userId, userId))) as FollowUpEnrollmentRow[];
  }

  async insertEnrollment(input: FollowUpEnrollmentInsert): Promise<FollowUpEnrollmentRow> {
    const [row] = await this.db.insert(followUpEnrollments).values(input as any).returning();
    return row as FollowUpEnrollmentRow;
  }

  async findLogsForEnrollment(enrollmentId: string): Promise<FollowUpLogRow[]> {
    return (await this.db
      .select()
      .from(followUpLogs)
      .where(eq(followUpLogs.enrollmentId, enrollmentId))
      .orderBy(desc(followUpLogs.sentAt))) as FollowUpLogRow[];
  }

  async insertLog(input: FollowUpLogInsert): Promise<void> {
    await this.db.insert(followUpLogs).values(input as any);
  }
}
