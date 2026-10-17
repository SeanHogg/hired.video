/**
 * Creator portfolio items (`portfolio_items`): owner CRUD, the public
 * gallery read, and the single-featured-item flip (partial unique index).
 */
import { and, desc, eq } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";

const { portfolioItems } = schema;

export type PortfolioItemRow = typeof portfolioItems.$inferSelect;
export type PortfolioItemInsert = typeof portfolioItems.$inferInsert;
export type PortfolioItemPatch = Partial<PortfolioItemInsert>;

const galleryOrder = [desc(portfolioItems.isFeatured), portfolioItems.sortOrder, desc(portfolioItems.createdAt)] as const;

/** Every item the user owns (public or not), featured first. */
export async function listOwnPortfolio(db: Db, userId: string): Promise<PortfolioItemRow[]> {
  return db
    .select()
    .from(portfolioItems)
    .where(eq(portfolioItems.userId, userId))
    .orderBy(...galleryOrder);
}

/** The user's public items, featured first. */
export async function listPublicPortfolio(db: Db, userId: string): Promise<PortfolioItemRow[]> {
  return db
    .select()
    .from(portfolioItems)
    .where(and(eq(portfolioItems.userId, userId), eq(portfolioItems.isPublic, true)))
    .orderBy(...galleryOrder);
}

export async function insertPortfolioItem(db: Db, values: PortfolioItemInsert): Promise<PortfolioItemRow> {
  const [row] = await db.insert(portfolioItems).values(values).returning();
  return row;
}

/** Best-effort insert (used by promo-project acceptance); swallows failures. */
export async function insertPortfolioItemQuietly(db: Db, values: PortfolioItemInsert): Promise<void> {
  await db.insert(portfolioItems).values(values).catch(() => undefined);
}

export async function findOwnedPortfolioItem(db: Db, id: string, userId: string): Promise<PortfolioItemRow | null> {
  const [row] = await db
    .select()
    .from(portfolioItems)
    .where(and(eq(portfolioItems.id, id), eq(portfolioItems.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function updatePortfolioItem(db: Db, id: string, patch: PortfolioItemPatch): Promise<PortfolioItemRow> {
  const [updated] = await db
    .update(portfolioItems)
    .set(patch)
    .where(eq(portfolioItems.id, id))
    .returning();
  return updated;
}

export async function deletePortfolioItem(db: Db, id: string): Promise<void> {
  await db.delete(portfolioItems).where(eq(portfolioItems.id, id));
}

/** Clear the user's existing featured flag (partial unique index requires this). */
export async function clearFeaturedPortfolio(db: Db, userId: string): Promise<void> {
  await db
    .update(portfolioItems)
    .set({ isFeatured: false, updatedAt: new Date() })
    .where(and(eq(portfolioItems.userId, userId), eq(portfolioItems.isFeatured, true)));
}
