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

/** Count a view of the ACTIVE package behind `slug` and return the updated
 *  row — ONE statement (`UPDATE … SET view_count = view_count + 1 WHERE
 *  slug = $1 AND is_active RETURNING *`). Null when no active package. */
export async function incrementActiveAtsPackageViewBySlug(db: Db, slug: string): Promise<AtsPackageRow | null> {
  const [row] = await buildActiveAtsPackageViewBump(db, slug);
  return row ?? null;
}

/** The statement behind incrementActiveAtsPackageViewBySlug (exported so
 *  tests can pin the SQL via drizzle.mock). */
export function buildActiveAtsPackageViewBump(db: Db, slug: string) {
  return db.update(studioAtsPackages)
    .set({ viewCount: sql`${studioAtsPackages.viewCount} + 1` })
    .where(and(eq(studioAtsPackages.slug, slug), eq(studioAtsPackages.isActive, true)))
    .returning();
}
