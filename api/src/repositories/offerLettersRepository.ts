/**
 * Persistence for hiring offer letters (`offer_letters`). Every function
 * takes the caller's `db` so the use cases in services/hiring/ own the
 * connection.
 */
import { and, desc, eq } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";

const { offerLetters } = schema;

export type OfferLetterRow = typeof offerLetters.$inferSelect;
export type OfferLetterInsert = typeof offerLetters.$inferInsert;
export type OfferLetterPatch = Partial<Omit<OfferLetterInsert, "id" | "createdByUserId" | "createdAt">>;

export async function listOfferLettersByCreator(db: Db, userId: string): Promise<OfferLetterRow[]> {
  return db
    .select()
    .from(offerLetters)
    .where(eq(offerLetters.createdByUserId, userId))
    .orderBy(desc(offerLetters.createdAt));
}

export async function insertOfferLetter(db: Db, values: OfferLetterInsert): Promise<OfferLetterRow> {
  const [row] = await db.insert(offerLetters).values(values).returning();
  return row;
}

/** The offer only when `userId` created it. */
export async function findOfferLetterForCreator(db: Db, id: string, userId: string): Promise<OfferLetterRow | null> {
  const [row] = await db
    .select()
    .from(offerLetters)
    .where(and(eq(offerLetters.id, id), eq(offerLetters.createdByUserId, userId)))
    .limit(1);
  return row ?? null;
}

/** Id + status of any offer (candidate-side accept/decline). */
export async function findOfferLetterStatus(db: Db, id: string): Promise<{ id: string; status: string } | null> {
  const [row] = await db
    .select({ id: offerLetters.id, status: offerLetters.status })
    .from(offerLetters)
    .where(eq(offerLetters.id, id))
    .limit(1);
  return row ?? null;
}

export async function updateOfferLetter(db: Db, id: string, patch: OfferLetterPatch): Promise<OfferLetterRow | undefined> {
  const [row] = await db
    .update(offerLetters)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(offerLetters.id, id))
    .returning();
  return row;
}

export async function deleteOfferLetter(db: Db, id: string): Promise<void> {
  await db.delete(offerLetters).where(eq(offerLetters.id, id));
}
