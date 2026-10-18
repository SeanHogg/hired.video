/**
 * AssessmentRunsRepository — predictive psychometric runs (`assessment_runs`:
 * Big Five, cognitive sample, SJT, EQ, DISC, resume↔role match). Every read
 * is owner-scoped. Lifecycle rules live in services/assessments/predictiveRuns.ts.
 */
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";
import type { AssessmentRun, NewAssessmentRun } from "../db/schema/assessments.js";

const { assessmentRuns } = schema;

type DbLike = ReturnType<typeof getDb>;

export type { AssessmentRun, NewAssessmentRun };

export type AssessmentRunPatch = Partial<
  Pick<NewAssessmentRun, "status" | "responses" | "questionIndex" | "scores" | "results" | "completedAt">
>;

export class AssessmentRunsRepository {
  constructor(private readonly db: DbLike = getDb()) {}

  /** The user's most recent run of one kind (any status). */
  async findLatestForKind(userId: string, kind: string): Promise<AssessmentRun | null> {
    const [row] = await this.db
      .select()
      .from(assessmentRuns)
      .where(and(eq(assessmentRuns.userId, userId), eq(assessmentRuns.assessmentKind, kind)))
      .orderBy(desc(assessmentRuns.createdAt))
      .limit(1);
    return row ?? null;
  }

  async findOwned(userId: string, id: string): Promise<AssessmentRun | null> {
    const [row] = await this.db
      .select()
      .from(assessmentRuns)
      .where(and(eq(assessmentRuns.id, id), eq(assessmentRuns.userId, userId)))
      .limit(1);
    return row ?? null;
  }

  listRecentForUser(userId: string, limit = 50): Promise<AssessmentRun[]> {
    return this.db
      .select()
      .from(assessmentRuns)
      .where(eq(assessmentRuns.userId, userId))
      .orderBy(desc(assessmentRuns.createdAt))
      .limit(limit);
  }

  async insert(values: NewAssessmentRun): Promise<AssessmentRun> {
    const [row] = await this.db.insert(assessmentRuns).values(values).returning();
    return row;
  }

  /** Patches a run (stamping updatedAt) and returns the updated row. */
  async update(id: string, patch: AssessmentRunPatch): Promise<AssessmentRun> {
    const [row] = await this.db
      .update(assessmentRuns)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(assessmentRuns.id, id))
      .returning();
    return row;
  }
}
