/**
 * Screening requests — recruiter-side reads/writes on `screening_requests`
 * (+ its ordered items) that the request-service lifecycle doesn't own:
 * load-by-id for the recruiter detail/resend views and the invitation
 * send-stamp. Item batch writes live in screeningRequestItemsRepository.
 */
import { asc, eq } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";
import type { ScreeningRequest } from "../db/schema/screening.js";

const { screeningRequests, screeningRequestItems } = schema;

export type ScreeningRequestItemRow = typeof screeningRequestItems.$inferSelect;

export async function findScreeningRequestById(db: Db, id: string): Promise<ScreeningRequest | null> {
  const [row] = await db.select().from(screeningRequests).where(eq(screeningRequests.id, id)).limit(1);
  return row ?? null;
}

export async function listScreeningRequestItems(db: Db, requestId: string): Promise<ScreeningRequestItemRow[]> {
  return db
    .select()
    .from(screeningRequestItems)
    .where(eq(screeningRequestItems.requestId, requestId))
    .orderBy(asc(screeningRequestItems.displayOrder));
}

/** Stamp an invitation send (`lastSentAt`), optionally setting the resend counter. */
export async function stampScreeningRequestSent(
  db: Db,
  id: string,
  now: Date,
  resendCount?: number,
): Promise<ScreeningRequest | undefined> {
  const [updated] = await db
    .update(screeningRequests)
    .set({ lastSentAt: now, updatedAt: now, ...(resendCount !== undefined ? { resendCount } : {}) })
    .where(eq(screeningRequests.id, id))
    .returning();
  return updated;
}
