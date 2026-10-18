/**
 * AdCampaignsRepository — the on-platform ad campaign aggregate
 * (`ad_campaigns` + its child `ad_sets`, gap #108/#109). Every read/write is
 * scoped to the owning user; the service (services/advertising/ad-campaigns.ts)
 * maps "no row" onto a 404.
 */

import { and, desc, eq } from "drizzle-orm";
import { schema } from "../db/index.js";

const { adCampaigns, adSets } = schema;

export type DbLike = any;
export type AdCampaignRow = typeof adCampaigns.$inferSelect;
export type AdCampaignInsert = typeof adCampaigns.$inferInsert;
export type AdSetRow = typeof adSets.$inferSelect;
export type AdSetInsert = typeof adSets.$inferInsert;

export interface IAdCampaignsRepository {
  listCampaignsForUser(userId: string): Promise<AdCampaignRow[]>;
  findCampaignForUser(id: string, userId: string): Promise<AdCampaignRow | null>;
  insertCampaign(values: AdCampaignInsert): Promise<AdCampaignRow>;
  updateCampaignForUser(id: string, userId: string, patch: Partial<AdCampaignInsert>): Promise<AdCampaignRow | null>;
  deleteCampaignForUser(id: string, userId: string): Promise<boolean>;
  listAdSetsForCampaign(campaignId: string): Promise<AdSetRow[]>;
  insertAdSet(values: AdSetInsert): Promise<AdSetRow>;
  updateAdSetForUser(id: string, userId: string, patch: Partial<AdSetInsert>): Promise<AdSetRow | null>;
  deleteAdSetForUser(id: string, userId: string): Promise<boolean>;
}

export class AdCampaignsRepository implements IAdCampaignsRepository {
  constructor(private readonly db: DbLike, private readonly now: () => Date = () => new Date()) {}

  // ── Campaigns ─────────────────────────────────────────────────────────────
  async listCampaignsForUser(userId: string): Promise<AdCampaignRow[]> {
    return this.db.select().from(adCampaigns)
      .where(eq(adCampaigns.userId, userId))
      .orderBy(desc(adCampaigns.createdAt));
  }

  async findCampaignForUser(id: string, userId: string): Promise<AdCampaignRow | null> {
    const [row] = await this.db.select().from(adCampaigns)
      .where(and(eq(adCampaigns.id, id), eq(adCampaigns.userId, userId)))
      .limit(1);
    return row ?? null;
  }

  async insertCampaign(values: AdCampaignInsert): Promise<AdCampaignRow> {
    const [row] = await this.db.insert(adCampaigns).values(values).returning();
    return row;
  }

  async updateCampaignForUser(id: string, userId: string, patch: Partial<AdCampaignInsert>): Promise<AdCampaignRow | null> {
    const [row] = await this.db.update(adCampaigns)
      .set({ ...patch, updatedAt: this.now() })
      .where(and(eq(adCampaigns.id, id), eq(adCampaigns.userId, userId)))
      .returning();
    return row ?? null;
  }

  async deleteCampaignForUser(id: string, userId: string): Promise<boolean> {
    const rows = await this.db.delete(adCampaigns)
      .where(and(eq(adCampaigns.id, id), eq(adCampaigns.userId, userId)))
      .returning({ id: adCampaigns.id });
    return rows.length > 0;
  }

  // ── Ad sets ───────────────────────────────────────────────────────────────
  async listAdSetsForCampaign(campaignId: string): Promise<AdSetRow[]> {
    return this.db.select().from(adSets)
      .where(eq(adSets.campaignId, campaignId))
      .orderBy(desc(adSets.createdAt));
  }

  async insertAdSet(values: AdSetInsert): Promise<AdSetRow> {
    const [row] = await this.db.insert(adSets).values(values).returning();
    return row;
  }

  async updateAdSetForUser(id: string, userId: string, patch: Partial<AdSetInsert>): Promise<AdSetRow | null> {
    const [row] = await this.db.update(adSets)
      .set({ ...patch, updatedAt: this.now() })
      .where(and(eq(adSets.id, id), eq(adSets.userId, userId)))
      .returning();
    return row ?? null;
  }

  async deleteAdSetForUser(id: string, userId: string): Promise<boolean> {
    const rows = await this.db.delete(adSets)
      .where(and(eq(adSets.id, id), eq(adSets.userId, userId)))
      .returning({ id: adSets.id });
    return rows.length > 0;
  }
}
