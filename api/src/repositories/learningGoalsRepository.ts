/**
 * Learning goals (mig 0199) — a learner's own stated objectives — plus the
 * published-course keyword search that seeds goal recommendations.
 * Every goal read/write is owner-scoped by `userId`.
 */
import { and, desc, eq, or, sql } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";
import type { LearningGoal } from "../db/schema/learning.js";

const { learningGoals, courses, users, userProfiles } = schema;

export async function listGoalsByUser(db: Db, userId: string): Promise<LearningGoal[]> {
  return db
    .select()
    .from(learningGoals)
    .where(eq(learningGoals.userId, userId))
    .orderBy(desc(learningGoals.createdAt));
}

export async function insertGoal(
  db: Db,
  values: { userId: string; goalText: string; source: string },
): Promise<LearningGoal> {
  const [row] = await db
    .insert(learningGoals)
    .values({ ...values, status: "active" } as never)
    .returning();
  return row as LearningGoal;
}

export async function findOwnedGoal(db: Db, userId: string, id: string): Promise<LearningGoal | null> {
  const [row] = await db
    .select()
    .from(learningGoals)
    .where(and(eq(learningGoals.id, id), eq(learningGoals.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function updateGoal(
  db: Db,
  id: string,
  patch: { goalText?: string; status?: string },
): Promise<LearningGoal> {
  const [row] = await db
    .update(learningGoals)
    .set({ ...patch, updatedAt: new Date() } as never)
    .where(eq(learningGoals.id, id))
    .returning();
  return row as LearningGoal;
}

export async function deleteGoal(db: Db, id: string): Promise<void> {
  await db.delete(learningGoals).where(eq(learningGoals.id, id));
}

/** Published courses whose title / summary / category / tags match any token
 *  (most-enrolled first). No tokens → the most-enrolled published courses. */
export async function searchPublishedCoursesByTokens(db: Db, tokens: string[], limit: number) {
  const matchClause =
    tokens.length > 0
      ? or(
          ...tokens.flatMap((tok) => {
            const like = `%${tok}%`;
            return [
              sql`${courses.title} ILIKE ${like}`,
              sql`${courses.summary} ILIKE ${like}`,
              sql`${courses.category} ILIKE ${like}`,
              sql`${courses.tags}::text ILIKE ${like}`,
            ];
          }),
        )
      : undefined;

  const whereClause = matchClause
    ? and(eq(courses.status, "published"), matchClause)
    : eq(courses.status, "published");

  return db
    .select({
      course: courses,
      author: { id: users.id, name: users.name },
      authorProfile: {
        avatarUrl: userProfiles.avatarUrl,
        customUrlSlug: userProfiles.customUrlSlug,
      },
    })
    .from(courses)
    .innerJoin(users, eq(courses.userId, users.id))
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(whereClause)
    .orderBy(desc(courses.enrollmentCount))
    .limit(limit);
}
