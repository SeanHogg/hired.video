/**
 * AdPromotionRepository — table access for the self-serve promotion writes
 * that carry a content target (#176): job boosts, company boosts and ad
 * creatives. The service (services/advertising/promotion.ts) decides; this
 * file only reads and writes rows.
 */

import { and, desc, eq, inArray } from "drizzle-orm";
import { schema } from "../db/index.js";

const { jobBoosts, companyBoosts, ads, adSets, jobItems, companyProfiles } = schema;

export type DbLike = any;
export type JobBoostRow = typeof jobBoosts.$inferSelect;
export type CompanyBoostRow = typeof companyBoosts.$inferSelect;
export type AdRow = typeof ads.$inferSelect;
export type NewJobBoostRow = typeof jobBoosts.$inferInsert;
export type NewCompanyBoostRow = typeof companyBoosts.$inferInsert;
export type NewAdRow = typeof ads.$inferInsert;

export class AdPromotionRepository {
  constructor(private readonly db: DbLike) {}

  async isJobPostedBy(jobId: string, userId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: jobItems.id })
      .from(jobItems)
      .where(and(eq(jobItems.id, jobId), eq(jobItems.postedByUserId, userId)))
      .limit(1);
    return Boolean(row);
  }

  async isCompanyOwnedBy(companyId: string, userId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: companyProfiles.id })
      .from(companyProfiles)
      .where(and(eq(companyProfiles.id, companyId), eq(companyProfiles.ownerId, userId)))
      .limit(1);
    return Boolean(row);
  }

  async isAdSetOwnedBy(adSetId: string, userId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: adSets.id })
      .from(adSets)
      .where(and(eq(adSets.id, adSetId), eq(adSets.userId, userId)))
      .limit(1);
    return Boolean(row);
  }

  async insertJobBoost(row: NewJobBoostRow): Promise<JobBoostRow> {
    const [created] = await this.db.insert(jobBoosts).values(row).returning();
    return created;
  }

  async insertCompanyBoost(row: NewCompanyBoostRow): Promise<CompanyBoostRow> {
    const [created] = await this.db.insert(companyBoosts).values(row).returning();
    return created;
  }

  async markJobSponsored(jobId: string, until: Date): Promise<void> {
    await this.db
      .update(jobItems)
      .set({ sponsored: true, sponsoredUntil: until, sponsoredRankBoost: 10 })
      .where(eq(jobItems.id, jobId));
  }

  async markCompanyFeatured(companyId: string, until: Date): Promise<void> {
    await this.db
      .update(companyProfiles)
      .set({ featured: true, featuredUntil: until, featuredRankBoost: 10, updatedAt: new Date() })
      .where(eq(companyProfiles.id, companyId));
  }

  async listJobBoostsForUser(userId: string): Promise<JobBoostRow[]> {
    return this.db
      .select()
      .from(jobBoosts)
      .where(eq(jobBoosts.userId, userId))
      .orderBy(desc(jobBoosts.createdAt))
      .limit(500);
  }

  async listCompanyBoostsForUser(userId: string): Promise<CompanyBoostRow[]> {
    return this.db
      .select()
      .from(companyBoosts)
      .where(eq(companyBoosts.userId, userId))
      .orderBy(desc(companyBoosts.createdAt))
      .limit(500);
  }

  async jobTitlesByIds(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows: Array<{ id: string; title: string }> = await this.db
      .select({ id: jobItems.id, title: jobItems.title })
      .from(jobItems)
      .where(inArray(jobItems.id, ids));
    return new Map(rows.map((r) => [r.id, r.title]));
  }

  async companyNamesByIds(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows: Array<{ id: string; name: string }> = await this.db
      .select({ id: companyProfiles.id, name: companyProfiles.name })
      .from(companyProfiles)
      .where(inArray(companyProfiles.id, ids));
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  async insertAd(row: NewAdRow): Promise<AdRow> {
    const [created] = await this.db.insert(ads).values(row).returning();
    return created;
  }

  async updateAdForOwner(adId: string, userId: string, patch: Partial<NewAdRow>): Promise<AdRow | null> {
    const [updated] = await this.db
      .update(ads)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(ads.id, adId), eq(ads.userId, userId)))
      .returning();
    return updated ?? null;
  }

  async listAdsForAdSet(adSetId: string): Promise<AdRow[]> {
    return this.db
      .select()
      .from(ads)
      .where(eq(ads.adSetId, adSetId))
      .orderBy(desc(ads.createdAt))
      .limit(500);
  }
}
