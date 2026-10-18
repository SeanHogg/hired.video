/**
 * ATS-compatible output packages — the `studio_ats_packages` table (a
 * shareable landing page per generated package, keyed by a unique slug).
 */
import { and, eq, sql } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";

const { studioAtsPackages } = schema;

export type AtsPackageRow = typeof studioAtsPackages.$inferSelect;
export type AtsPackageInsert = typeof studioAtsPackages.$inferInsert;

export async function insertAtsPackage(db: Db, values: AtsPackageInsert): Promise<AtsPackageRow> {
  const [row] = await db.insert(studioAtsPackages).values(values).returning();
  return row;
}

export async function findActiveAtsPackageBySlug(db: Db, slug: string): Promise<AtsPackageRow | null> {
  const [row] = await db.select().from(studioAtsPackages)
    .where(and(eq(studioAtsPackages.slug, slug), eq(studioAtsPackages.isActive, true)))
    .limit(1);
  return row ?? null;
}

/** Atomic `view_count + 1` (one statement). */
export async function incrementAtsPackageViewCount(db: Db, id: string): Promise<void> {
  await db.update(studioAtsPackages)
    .set({ viewCount: sql`${studioAtsPackages.viewCount} + 1` })
    .where(eq(studioAtsPackages.id, id));
}
