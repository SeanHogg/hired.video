/**
 * SCORM CMI runtime state persistence (#161) — one row per
 * (enrollment, lesson), written by the lesson player's commit calls.
 */
import { and, eq } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";

const { scormCmiStates } = schema;

export type ScormCmiStateRow = typeof scormCmiStates.$inferSelect;

export async function findCmiState(
  db: Db,
  enrollmentId: string,
  lessonId: string,
): Promise<ScormCmiStateRow | null> {
  const [row] = await db.select().from(scormCmiStates)
    .where(and(eq(scormCmiStates.enrollmentId, enrollmentId), eq(scormCmiStates.lessonId, lessonId)))
    .limit(1);
  return row ?? null;
}

export async function updateCmiState(
  db: Db,
  id: string,
  patch: Record<string, unknown>,
): Promise<ScormCmiStateRow | undefined> {
  const [updated] = await db.update(scormCmiStates)
    .set(patch as Partial<typeof scormCmiStates.$inferInsert>)
    .where(eq(scormCmiStates.id, id))
    .returning();
  return updated;
}

export async function insertCmiState(
  db: Db,
  values: Record<string, unknown>,
): Promise<ScormCmiStateRow | undefined> {
  const [created] = await db.insert(scormCmiStates)
    .values(values as typeof scormCmiStates.$inferInsert)
    .returning();
  return created;
}
