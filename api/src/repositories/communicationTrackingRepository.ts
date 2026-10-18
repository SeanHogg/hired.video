/**
 * CommunicationTrackingRepository — the outreach touch log
 * (`communication_tracking`): one row per sent/received communication a user
 * records. Typed Drizzle wrappers only; the rules live in
 * services/communication/communicationService.ts.
 */
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";

const { communicationTracking } = schema;

export type CommunicationTrackingRow = typeof communicationTracking.$inferSelect;
export type NewCommunicationTrackingRow = typeof communicationTracking.$inferInsert;

/** One user's tracking rows, newest first. */
export async function listCommunicationTrackingForUser(userId: string): Promise<CommunicationTrackingRow[]> {
  return getDb()
    .select()
    .from(communicationTracking)
    .where(eq(communicationTracking.userId, userId))
    .orderBy(desc(communicationTracking.createdAt));
}

export async function insertCommunicationTracking(
  values: NewCommunicationTrackingRow,
): Promise<CommunicationTrackingRow> {
  const [row] = await getDb().insert(communicationTracking).values(values).returning();
  return row;
}
