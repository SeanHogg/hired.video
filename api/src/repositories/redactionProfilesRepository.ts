/**
 * RedactionProfilesRepository — reusable per-company PII-stripping rule
 * sets (`redaction_profiles`, gap #99). One default per company (partial
 * unique index), so callers clear the old default before setting a new one.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";

const { redactionProfiles } = schema;

export type RedactionProfileRow = typeof redactionProfiles.$inferSelect;
export type RedactionProfileInsert = typeof redactionProfiles.$inferInsert;

/** Every profile of the given companies (unordered — scope bootstrap). */
export async function findRedactionProfilesForCompanies(companyIds: string[]): Promise<RedactionProfileRow[]> {
  return getDb().select().from(redactionProfiles).where(inArray(redactionProfiles.companyId, companyIds));
}

/** Profiles of one company (when `companyId` is set) or of every company in
 *  `companyIds` — default first, then most recently updated. */
export async function listRedactionProfiles(filter: {
  companyId?: string;
  companyIds: string[];
}): Promise<RedactionProfileRow[]> {
  return getDb()
    .select()
    .from(redactionProfiles)
    .where(
      filter.companyId
        ? eq(redactionProfiles.companyId, filter.companyId)
        : inArray(redactionProfiles.companyId, filter.companyIds),
    )
    .orderBy(desc(redactionProfiles.isDefault), desc(redactionProfiles.updatedAt));
}

export async function findRedactionProfileById(id: string): Promise<RedactionProfileRow | null> {
  const [row] = await getDb().select().from(redactionProfiles).where(eq(redactionProfiles.id, id)).limit(1);
  return row ?? null;
}

export async function findRedactionProfilesByIds(ids: string[]): Promise<RedactionProfileRow[]> {
  if (ids.length === 0) return [];
  return getDb().select().from(redactionProfiles).where(inArray(redactionProfiles.id, ids));
}

/** Unset the company's current default profile (if any). */
export async function clearDefaultRedactionProfile(companyId: string): Promise<void> {
  await getDb()
    .update(redactionProfiles)
    .set({ isDefault: false, updatedAt: new Date() })
    .where(and(eq(redactionProfiles.companyId, companyId), eq(redactionProfiles.isDefault, true)));
}

export async function insertRedactionProfile(values: RedactionProfileInsert): Promise<RedactionProfileRow> {
  const [row] = await getDb().insert(redactionProfiles).values(values).returning();
  return row;
}

export async function updateRedactionProfile(
  id: string,
  patch: Partial<RedactionProfileInsert>,
): Promise<RedactionProfileRow | null> {
  const [row] = await getDb()
    .update(redactionProfiles)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(redactionProfiles.id, id))
    .returning();
  return row ?? null;
}

export async function deleteRedactionProfile(id: string): Promise<void> {
  await getDb().delete(redactionProfiles).where(eq(redactionProfiles.id, id));
}
