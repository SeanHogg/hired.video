/**
 * Webcam / screen recordings and their delivery-coaching results — the
 * `studio_recordings` table and its child `studio_delivery_coaching`. Every
 * read and write is scoped to the owning user.
 */
import { and, desc, eq } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";

const { studioRecordings, studioDeliveryCoaching } = schema;

export type StudioRecordingRow = typeof studioRecordings.$inferSelect;
export type StudioRecordingInsert = typeof studioRecordings.$inferInsert;
export type DeliveryCoachingRow = typeof studioDeliveryCoaching.$inferSelect;
export type DeliveryCoachingInsert = typeof studioDeliveryCoaching.$inferInsert;

export async function insertRecording(db: Db, values: StudioRecordingInsert): Promise<StudioRecordingRow> {
  const [row] = await db.insert(studioRecordings).values(values).returning();
  return row;
}

export async function findOwnedRecording(db: Db, id: string, userId: string): Promise<StudioRecordingRow | null> {
  const [row] = await db.select().from(studioRecordings)
    .where(and(eq(studioRecordings.id, id), eq(studioRecordings.userId, userId)))
    .limit(1);
  return row ?? null;
}

/** The deleted row, or null when the user owns no such recording. */
export async function deleteOwnedRecording(db: Db, id: string, userId: string): Promise<StudioRecordingRow | null> {
  const [row] = await db.delete(studioRecordings)
    .where(and(eq(studioRecordings.id, id), eq(studioRecordings.userId, userId)))
    .returning();
  return row ?? null;
}

export async function setRecordingTranscription(
  db: Db,
  id: string,
  transcription: string,
  wordTimestamps: unknown,
): Promise<void> {
  await db.update(studioRecordings)
    .set({ transcription, wordTimestamps })
    .where(eq(studioRecordings.id, id));
}

export async function insertDeliveryCoaching(db: Db, values: DeliveryCoachingInsert): Promise<DeliveryCoachingRow> {
  const [row] = await db.insert(studioDeliveryCoaching).values(values).returning();
  return row;
}

/** The newest coaching result the user has for a recording. */
export async function findLatestDeliveryCoaching(
  db: Db,
  recordingId: string,
  userId: string,
): Promise<DeliveryCoachingRow | null> {
  const [row] = await db.select().from(studioDeliveryCoaching)
    .where(and(eq(studioDeliveryCoaching.recordingId, recordingId), eq(studioDeliveryCoaching.userId, userId)))
    .orderBy(desc(studioDeliveryCoaching.createdAt))
    .limit(1);
  return row ?? null;
}
