/**
 * ReferenceContactsRepository — the owner's reference people
 * (`reference_contacts`, #1677). Owner-scoped on `owner_user_id` unless a
 * method says otherwise. Typed Drizzle wrappers only; the rules (public
 * summaries gate, share ownership check, live-link sweep, cache
 * invalidation) live in services/references/referenceService.ts.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";

const { referenceContacts } = schema;

export type ReferenceContactRow = typeof referenceContacts.$inferSelect;
export type NewReferenceContactRow = typeof referenceContacts.$inferInsert;

/** The editable columns (everything the owner sets on a contact). */
export type ReferenceContactFields = Partial<
  Pick<NewReferenceContactRow, "name" | "title" | "company" | "email" | "phone" | "relationship" | "notes">
>;

/** The text fields the live-link sweep compares against (#2258). */
export interface ReferenceContactSnapshot {
  id: string;
  name: string;
  title: string | null;
  company: string | null;
  relationship: string | null;
}

/** The non-PII summary shown on a public profile (never email/phone/notes). */
export type ReferenceContactSummary = ReferenceContactSnapshot;

const summaryCols = {
  id: referenceContacts.id,
  name: referenceContacts.name,
  title: referenceContacts.title,
  company: referenceContacts.company,
  relationship: referenceContacts.relationship,
} as const;

const owned = (ownerUserId: string, id: string) =>
  and(eq(referenceContacts.id, id), eq(referenceContacts.ownerUserId, ownerUserId));

/** The owner's contacts, alphabetical. */
export async function listReferenceContacts(ownerUserId: string): Promise<ReferenceContactRow[]> {
  return getDb()
    .select()
    .from(referenceContacts)
    .where(eq(referenceContacts.ownerUserId, ownerUserId))
    .orderBy(asc(referenceContacts.name));
}

/** The owner's contacts as non-PII summaries, alphabetical. */
export async function listReferenceContactSummaries(ownerUserId: string): Promise<ReferenceContactSummary[]> {
  return getDb()
    .select(summaryCols)
    .from(referenceContacts)
    .where(eq(referenceContacts.ownerUserId, ownerUserId))
    .orderBy(asc(referenceContacts.name));
}

export async function insertReferenceContact(
  ownerUserId: string,
  fields: ReferenceContactFields & { name: string },
): Promise<ReferenceContactRow> {
  const [row] = await getDb()
    .insert(referenceContacts)
    .values({ ...fields, ownerUserId })
    .returning();
  return row;
}

/** One owned contact's comparable text, or null when it isn't the owner's. */
export async function findOwnedReferenceContactSnapshot(
  ownerUserId: string,
  id: string,
): Promise<ReferenceContactSnapshot | null> {
  const [row] = await getDb().select(summaryCols).from(referenceContacts).where(owned(ownerUserId, id)).limit(1);
  return row ?? null;
}

/** Patch one owned contact (stamps `updatedAt`); null when it isn't the owner's. */
export async function updateOwnedReferenceContact(
  ownerUserId: string,
  id: string,
  patch: ReferenceContactFields,
): Promise<ReferenceContactRow | null> {
  const [row] = await getDb()
    .update(referenceContacts)
    .set({ ...patch, updatedAt: new Date() })
    .where(owned(ownerUserId, id))
    .returning();
  return row ?? null;
}

/** Delete one owned contact (no-op when it isn't the owner's). */
export async function deleteOwnedReferenceContact(ownerUserId: string, id: string): Promise<void> {
  await getDb().delete(referenceContacts).where(owned(ownerUserId, id));
}

/** How many of `ids` belong to the owner. */
export async function countOwnedReferenceContacts(ownerUserId: string, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const rows = await getDb()
    .select({ id: referenceContacts.id })
    .from(referenceContacts)
    .where(and(eq(referenceContacts.ownerUserId, ownerUserId), inArray(referenceContacts.id, ids)));
  return rows.length;
}

/** Contacts by id — the point-in-time snapshot a share grants (not owner-scoped:
 *  the share's own ownership check ran when it was created). */
export async function findReferenceContactsByIds(ids: string[]): Promise<ReferenceContactRow[]> {
  if (ids.length === 0) return [];
  return getDb().select().from(referenceContacts).where(inArray(referenceContacts.id, ids));
}
