/**
 * SkillAssessmentsRepository — the skills-test aggregate (#76):
 * `skill_assessments` (definitions) + `assessment_attempts` (a candidate's
 * timed attempts). Pure data access; grading and attempt rules live in
 * services/assessments/skillAssessments.ts.
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";
import type { AssessmentAttempt, SkillAssessment } from "../db/schema/assessments.js";

const { skillAssessments, assessmentAttempts } = schema;

type DbLike = ReturnType<typeof getDb>;

export type { AssessmentAttempt, SkillAssessment };

/** Public catalog projection — never carries the questions/answers. */
const SUMMARY_COLUMNS = {
  id: skillAssessments.id,
  slug: skillAssessments.slug,
  title: skillAssessments.title,
  description: skillAssessments.description,
  skillCategory: skillAssessments.skillCategory,
  difficulty: skillAssessments.difficulty,
  timeLimitMinutes: skillAssessments.timeLimitMinutes,
  passingScore: skillAssessments.passingScore,
};

export type AttemptGradePatch = Pick<
  AssessmentAttempt,
  "answers" | "gradingResults" | "rawScore" | "totalPoints" | "percentageScore" | "passed" | "aiFeedback"
>;

export class SkillAssessmentsRepository {
  constructor(private readonly db: DbLike = getDb()) {}

  // ── skill_assessments ─────────────────────────────────────────────────────

  listActiveSummaries(skillCategory?: string) {
    return this.db
      .select(SUMMARY_COLUMNS)
      .from(skillAssessments)
      .where(and(
        eq(skillAssessments.isActive, true),
        ...(skillCategory ? [eq(skillAssessments.skillCategory, skillCategory)] : []),
      ))
      .orderBy(skillAssessments.skillCategory);
  }

  async findActiveSummaryBySlug(slug: string) {
    const [row] = await this.db
      .select(SUMMARY_COLUMNS)
      .from(skillAssessments)
      .where(and(eq(skillAssessments.slug, slug), eq(skillAssessments.isActive, true)))
      .limit(1);
    return row ?? null;
  }

  async findActiveBySlug(slug: string): Promise<SkillAssessment | null> {
    const [row] = await this.db
      .select()
      .from(skillAssessments)
      .where(and(eq(skillAssessments.slug, slug), eq(skillAssessments.isActive, true)))
      .limit(1);
    return row ?? null;
  }

  async findById(id: string): Promise<SkillAssessment | null> {
    const [row] = await this.db.select().from(skillAssessments).where(eq(skillAssessments.id, id)).limit(1);
    return row ?? null;
  }

  // ── assessment_attempts ───────────────────────────────────────────────────

  async findInProgressAttempt(userId: string, assessmentId: string) {
    const [row] = await this.db
      .select({ id: assessmentAttempts.id, expiresAt: assessmentAttempts.expiresAt })
      .from(assessmentAttempts)
      .where(and(
        eq(assessmentAttempts.userId, userId),
        eq(assessmentAttempts.assessmentId, assessmentId),
        eq(assessmentAttempts.status, "in_progress"),
      ))
      .limit(1);
    return row ?? null;
  }

  /** Inserts the next attempt in ONE statement: `attempt_number` is the
   *  user's max for this assessment + 1, so retakes don't collide with the
   *  (user, assessment, attempt_number) unique index. */
  async insertAttempt(userId: string, assessmentId: string, expiresAt: Date | null): Promise<AssessmentAttempt> {
    const [row] = await this.db
      .insert(assessmentAttempts)
      .values({
        userId,
        assessmentId,
        status: "in_progress",
        expiresAt,
        attemptNumber: sql<number>`(
          SELECT COALESCE(MAX(${assessmentAttempts.attemptNumber}), 0) + 1
          FROM ${assessmentAttempts}
          WHERE ${assessmentAttempts.userId} = ${userId}
            AND ${assessmentAttempts.assessmentId} = ${assessmentId}
        )`,
      })
      .returning();
    return row;
  }

  async findOwnedAttempt(userId: string, attemptId: string): Promise<AssessmentAttempt | null> {
    const [row] = await this.db
      .select()
      .from(assessmentAttempts)
      .where(and(eq(assessmentAttempts.id, attemptId), eq(assessmentAttempts.userId, userId)))
      .limit(1);
    return row ?? null;
  }

  async markAttemptExpired(attemptId: string): Promise<void> {
    await this.db.update(assessmentAttempts).set({ status: "expired" }).where(eq(assessmentAttempts.id, attemptId));
  }

  async markAttemptGraded(attemptId: string, grade: AttemptGradePatch): Promise<void> {
    const now = new Date();
    await this.db
      .update(assessmentAttempts)
      .set({ ...grade, status: "graded", submittedAt: now, gradedAt: now })
      .where(eq(assessmentAttempts.id, attemptId));
  }

  /** Completed (graded/submitted) attempts with their assessment labels. */
  listCompletedResultsForUser(userId: string) {
    return this.db
      .select({
        id: assessmentAttempts.id,
        assessmentId: assessmentAttempts.assessmentId,
        status: assessmentAttempts.status,
        percentageScore: assessmentAttempts.percentageScore,
        passed: assessmentAttempts.passed,
        gradedAt: assessmentAttempts.gradedAt,
        title: skillAssessments.title,
        skillCategory: skillAssessments.skillCategory,
        difficulty: skillAssessments.difficulty,
      })
      .from(assessmentAttempts)
      .innerJoin(skillAssessments, eq(skillAssessments.id, assessmentAttempts.assessmentId))
      .where(and(
        eq(assessmentAttempts.userId, userId),
        inArray(assessmentAttempts.status, ["graded", "submitted"]),
      ))
      .orderBy(desc(assessmentAttempts.gradedAt));
  }

  /** Passed attempts — the public profile badges. */
  listPassedBadgesForUser(userId: string) {
    return this.db
      .select({
        title: skillAssessments.title,
        skillCategory: skillAssessments.skillCategory,
        difficulty: skillAssessments.difficulty,
        percentageScore: assessmentAttempts.percentageScore,
        gradedAt: assessmentAttempts.gradedAt,
      })
      .from(assessmentAttempts)
      .innerJoin(skillAssessments, eq(skillAssessments.id, assessmentAttempts.assessmentId))
      .where(and(eq(assessmentAttempts.userId, userId), eq(assessmentAttempts.passed, true)))
      .orderBy(desc(assessmentAttempts.gradedAt));
  }
}
