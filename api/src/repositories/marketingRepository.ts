/**
 * MarketingRepository — outbound acquisition funnel.
 *
 * Covers:
 *   • ads, adSets, adCampaigns          — paid ad products
 *   • jobBoosts, companyBoosts          — promoted placement products
 *   • marketingLeads                    — top-of-funnel leads
 *   • affiliateProfiles, affiliateReferrals, affiliateConversions, affiliatePayouts
 *   • emailCampaigns, emailCampaignRecipients
 *
 * Grouped because they're all "how we get users + how we track the
 * money we spend/earn on that." Distinct from Billing (invoicing +
 * subscription state) and from Conversations (direct user messaging).
 */

import { and, desc, eq, like, type SQL } from "drizzle-orm";
import { schema } from "../db/index.js";

const {
  ads,
  adSets,
  adCampaigns,
  jobBoosts,
  companyBoosts,
  marketingLeads,
  affiliateProfiles,
  affiliateReferrals,
  affiliateConversions,
  affiliatePayouts,
  emailCampaigns,
  emailCampaignRecipients,
} = schema;

export type DbLike = any;

export type AdRow = typeof ads.$inferSelect;
export type AdSetRow = typeof adSets.$inferSelect;
export type AdCampaignRow = typeof adCampaigns.$inferSelect;
export type JobBoostRow = typeof jobBoosts.$inferSelect;
export type CompanyBoostRow = typeof companyBoosts.$inferSelect;
export type MarketingLeadRow = typeof marketingLeads.$inferSelect;
export type MarketingLeadInsert = typeof marketingLeads.$inferInsert;
export type AffiliateProfileRow = typeof affiliateProfiles.$inferSelect;
export type AffiliateReferralRow = typeof affiliateReferrals.$inferSelect;
export type AffiliateConversionRow = typeof affiliateConversions.$inferSelect;
export type AffiliatePayoutRow = typeof affiliatePayouts.$inferSelect;
export type EmailCampaignRow = typeof emailCampaigns.$inferSelect;
export type EmailCampaignRecipientRow = typeof emailCampaignRecipients.$inferSelect;

export interface IMarketingRepository {
  // ads + boosts — listing only; writes are admin-gated and rare.
  listAdCampaigns(limit?: number): Promise<AdCampaignRow[]>;
  findActiveJobBoost(jobId: string): Promise<JobBoostRow | null>;
  findActiveCompanyBoost(companyId: string): Promise<CompanyBoostRow | null>;
  // marketing leads (signup funnel)
  insertMarketingLead(input: MarketingLeadInsert): Promise<MarketingLeadRow>;
  /** Insert a lead, ignoring a conflict (lead already captured). */
  captureMarketingLead(input: MarketingLeadInsert): Promise<void>;
  findMarketingLeadByEmail(email: string): Promise<MarketingLeadRow | null>;
  /** Newest 200 leads, optionally `source LIKE '<prefix>%'` and/or by status. */
  listMarketingLeads(filters: { sourcePrefix?: string | null; status?: string | null }): Promise<MarketingLeadRow[]>;
  /** Set a lead's triage status (stamps convertedAt on "converted"); null when not found. */
  updateMarketingLeadStatus(id: string, status: string): Promise<MarketingLeadRow | null>;
  // affiliates
  findAffiliateProfileByUserId(userId: string): Promise<AffiliateProfileRow | null>;
  findAffiliateReferralsForAffiliate(affiliateId: string): Promise<AffiliateReferralRow[]>;
  findAffiliateConversionsForAffiliate(affiliateId: string): Promise<AffiliateConversionRow[]>;
  findAffiliatePayoutsForAffiliate(affiliateId: string): Promise<AffiliatePayoutRow[]>;
  // email campaigns
  listEmailCampaigns(): Promise<EmailCampaignRow[]>;
  findEmailRecipientsForCampaign(campaignId: string): Promise<EmailCampaignRecipientRow[]>;
}

export class MarketingRepository implements IMarketingRepository {
  constructor(private readonly db: DbLike, private readonly now: () => Date = () => new Date()) {}

  async listAdCampaigns(limit = 100): Promise<AdCampaignRow[]> {
    return (await this.db
      .select()
      .from(adCampaigns)
      .orderBy(desc(adCampaigns.createdAt))
      .limit(Math.min(500, Math.max(1, limit)))) as AdCampaignRow[];
  }

  async findActiveJobBoost(jobId: string): Promise<JobBoostRow | null> {
    const [row] = await this.db.select().from(jobBoosts).where(eq(jobBoosts.jobId, jobId)).limit(1);
    return (row as JobBoostRow) ?? null;
  }

  async findActiveCompanyBoost(companyId: string): Promise<CompanyBoostRow | null> {
    const [row] = await this.db
      .select()
      .from(companyBoosts)
      .where(eq(companyBoosts.companyId, companyId))
      .limit(1);
    return (row as CompanyBoostRow) ?? null;
  }

  async insertMarketingLead(input: MarketingLeadInsert): Promise<MarketingLeadRow> {
    const [row] = await this.db.insert(marketingLeads).values(input as any).returning();
    return row as MarketingLeadRow;
  }

  async captureMarketingLead(input: MarketingLeadInsert): Promise<void> {
    await this.db.insert(marketingLeads).values(input as any).onConflictDoNothing();
  }

  async findMarketingLeadByEmail(email: string): Promise<MarketingLeadRow | null> {
    const [row] = await this.db
      .select()
      .from(marketingLeads)
      .where(eq(marketingLeads.email, email))
      .limit(1);
    return (row as MarketingLeadRow) ?? null;
  }

  async listMarketingLeads(filters: { sourcePrefix?: string | null; status?: string | null }): Promise<MarketingLeadRow[]> {
    const conditions: SQL[] = [];
    if (filters.sourcePrefix) conditions.push(like(marketingLeads.source, `${filters.sourcePrefix}%`));
    if (filters.status) conditions.push(eq(marketingLeads.status, filters.status));
    const baseQuery = this.db.select().from(marketingLeads);
    const filtered = conditions.length > 0
      ? baseQuery.where(conditions.length === 1 ? conditions[0] : and(...conditions))
      : baseQuery;
    return (await filtered.orderBy(desc(marketingLeads.createdAt)).limit(200)) as MarketingLeadRow[];
  }

  async updateMarketingLeadStatus(id: string, status: string): Promise<MarketingLeadRow | null> {
    const at = this.now();
    const updates: Partial<MarketingLeadInsert> = { status, updatedAt: at };
    if (status === "converted") updates.convertedAt = at;
    const [row] = await this.db.update(marketingLeads).set(updates).where(eq(marketingLeads.id, id)).returning();
    return (row as MarketingLeadRow) ?? null;
  }

  async findAffiliateProfileByUserId(userId: string): Promise<AffiliateProfileRow | null> {
    const [row] = await this.db
      .select()
      .from(affiliateProfiles)
      .where(eq(affiliateProfiles.userId, userId))
      .limit(1);
    return (row as AffiliateProfileRow) ?? null;
  }

  async findAffiliateReferralsForAffiliate(affiliateId: string): Promise<AffiliateReferralRow[]> {
    return (await this.db
      .select()
      .from(affiliateReferrals)
      .where(eq(affiliateReferrals.affiliateId, affiliateId))) as AffiliateReferralRow[];
  }

  async findAffiliateConversionsForAffiliate(affiliateId: string): Promise<AffiliateConversionRow[]> {
    return (await this.db
      .select()
      .from(affiliateConversions)
      .where(eq(affiliateConversions.affiliateId, affiliateId))) as AffiliateConversionRow[];
  }

  async findAffiliatePayoutsForAffiliate(affiliateId: string): Promise<AffiliatePayoutRow[]> {
    return (await this.db
      .select()
      .from(affiliatePayouts)
      .where(eq(affiliatePayouts.affiliateId, affiliateId))) as AffiliatePayoutRow[];
  }

  async listEmailCampaigns(): Promise<EmailCampaignRow[]> {
    return (await this.db
      .select()
      .from(emailCampaigns)
      .orderBy(desc(emailCampaigns.createdAt))) as EmailCampaignRow[];
  }

  async findEmailRecipientsForCampaign(campaignId: string): Promise<EmailCampaignRecipientRow[]> {
    return (await this.db
      .select()
      .from(emailCampaignRecipients)
      .where(eq(emailCampaignRecipients.campaignId, campaignId))) as EmailCampaignRecipientRow[];
  }

  // Pin imports reserved for future admin reporting queries.
  private readonly _adsPinned = ads;
  private readonly _adSetsPinned = adSets;
}
