/**
 * Persistence for onboarding checklists (`onboarding_checklists`) and their
 * tasks (`onboarding_tasks`) — one aggregate. Every function takes the
 * caller's `db` so the use cases in services/hiring/ own the connection.
 */
import { and, desc, eq } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";

const { onboardingChecklists, onboardingTasks } = schema;

export type OnboardingChecklistRow = typeof onboardingChecklists.$inferSelect;
export type OnboardingChecklistInsert = typeof onboardingChecklists.$inferInsert;
export type OnboardingTaskRow = typeof onboardingTasks.$inferSelect;
export type OnboardingTaskInsert = typeof onboardingTasks.$inferInsert;

export async function listChecklistsByCreator(db: Db, userId: string): Promise<OnboardingChecklistRow[]> {
  return db
    .select()
    .from(onboardingChecklists)
    .where(eq(onboardingChecklists.createdByUserId, userId))
    .orderBy(desc(onboardingChecklists.createdAt));
}

export async function insertChecklist(db: Db, values: OnboardingChecklistInsert): Promise<OnboardingChecklistRow> {
  const [row] = await db.insert(onboardingChecklists).values(values).returning();
  return row;
}

export async function insertChecklistTasks(db: Db, values: OnboardingTaskInsert[]): Promise<OnboardingTaskRow[]> {
  return db.insert(onboardingTasks).values(values).returning();
}

/** The checklist only when `userId` created it. */
export async function findChecklistForCreator(db: Db, id: string, userId: string): Promise<OnboardingChecklistRow | null> {
  const [row] = await db
    .select()
    .from(onboardingChecklists)
    .where(and(eq(onboardingChecklists.id, id), eq(onboardingChecklists.createdByUserId, userId)))
    .limit(1);
  return row ?? null;
}

export async function listChecklistTasks(db: Db, checklistId: string): Promise<OnboardingTaskRow[]> {
  return db.select().from(onboardingTasks).where(eq(onboardingTasks.checklistId, checklistId));
}

/** Marks one task of the checklist complete (no-op when the task is not in it). */
export async function completeChecklistTask(
  db: Db,
  checklistId: string,
  taskId: string,
  completedByUserId: string,
): Promise<void> {
  await db
    .update(onboardingTasks)
    .set({ isCompleted: true, completedAt: new Date(), completedByUserId })
    .where(and(eq(onboardingTasks.id, taskId), eq(onboardingTasks.checklistId, checklistId)));
}

export async function updateChecklistProgress(
  db: Db,
  id: string,
  completionPercentage: string,
  status: string,
): Promise<OnboardingChecklistRow | undefined> {
  const [row] = await db
    .update(onboardingChecklists)
    .set({ completionPercentage, status, updatedAt: new Date() })
    .where(eq(onboardingChecklists.id, id))
    .returning();
  return row;
}
