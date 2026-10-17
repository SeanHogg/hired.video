/**
 * Persistence for studio brand kits (`studio_brand_kits`). A kit is owned by
 * a user (personal / delegated) or a company; "default" is one per owner
 * scope.
 */
import { and, desc, eq, isNull, type SQL } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";

const { studioBrandKits } = schema;

export type BrandKitRow = typeof studioBrandKits.$inferSelect;
export type BrandKitInsert = typeof studioBrandKits.$inferInsert;

export const brandKitOwnershipColumns = {
  userIdColumn: studioBrandKits.userId,
  companyIdColumn: studioBrandKits.companyId,
};

export async function listBrandKitsWhere(db: Db, where: SQL | undefined): Promise<BrandKitRow[]> {
  return db.select().from(studioBrandKits).where(where).orderBy(desc(studioBrandKits.createdAt));
}

export async function findBrandKitForUser(db: Db, id: string, userId: string): Promise<BrandKitRow | null> {
  const [kit] = await db
    .select()
    .from(studioBrandKits)
    .where(and(eq(studioBrandKits.id, id), eq(studioBrandKits.userId, userId)))
    .limit(1);
  return kit ?? null;
}

export async function findBrandKitOwner(
  db: Db,
  id: string,
): Promise<{ userId: string; companyId: string | null } | null> {
  const [row] = await db
    .select({ userId: studioBrandKits.userId, companyId: studioBrandKits.companyId })
    .from(studioBrandKits)
    .where(eq(studioBrandKits.id, id))
    .limit(1);
  return row ?? null;
}

/** Clear `is_default` across one owner scope: the company's kits, or the
 *  user's personal (company-less) kits — never both. */
export async function clearDefaultBrandKits(db: Db, owner: { userId: string; companyId: string | null }): Promise<void> {
  const scope = owner.companyId
    ? eq(studioBrandKits.companyId, owner.companyId)
    : and(eq(studioBrandKits.userId, owner.userId), isNull(studioBrandKits.companyId));
  await db.update(studioBrandKits).set({ isDefault: false } as Partial<BrandKitInsert>).where(scope);
}

export async function insertBrandKit(db: Db, values: BrandKitInsert): Promise<BrandKitRow> {
  const [kit] = await db.insert(studioBrandKits).values(values).returning();
  return kit;
}

export async function updateBrandKit(db: Db, id: string, patch: Partial<BrandKitInsert>): Promise<BrandKitRow | null> {
  const [row] = await db.update(studioBrandKits).set(patch).where(eq(studioBrandKits.id, id)).returning();
  return row ?? null;
}

export async function deleteBrandKit(db: Db, id: string): Promise<void> {
  await db.delete(studioBrandKits).where(eq(studioBrandKits.id, id));
}
