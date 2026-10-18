/**
 * AdPromotionRepository — table access for the self-serve promotion writes
 * that carry a content target (#176): job boosts and ad creatives. The
 * service (services/advertising/promotion.ts) decides; this file only reads
 * and writes rows.
 */

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";

const { jobBoosts, ads, adSets, jobItems, boostCheckouts, tokenPackPurchases, courseCheckouts } = schema;

/** A job boost created by checkout start, awaiting a confirmed payment. */
export const JOB_BOOST_PENDING_STATUS = "pending_payment";

export type DbLike = any;
export type JobBoostRow = typeof jobBoosts.$inferSelect;
export type AdRow = typeof ads.$inferSelect;
export type NewJobBoostRow = typeof jobBoosts.$inferInsert;
export type NewAdRow = typeof ads.$inferInsert;
export type ServableAd = Pick<AdRow, "id" | "headline" | "description" | "imageUrl" | "ctaText" | "ctaUrl" | "destinationUrl">;

/** The single-statement "pick a servable ad + count its impression" query
 *  (exported so tests can pin the SQL via drizzle.mock). */
export function buildServeAdImpression(db: Db, placements: string[]) {
  const pick = db
    .select({ id: ads.id })
    .from(ads)
    .innerJoin(adSets, eq(ads.adSetId, adSets.id))
    .where(and(eq(ads.status, "active"), eq(adSets.status, "active"), inArray(adSets.placementType, placements)))
    .limit(1);
  return db
    .update(ads)
    .set({ impressions: sql`${ads.impressions} + 1`, updatedAt: new Date() })
    .where(inArray(ads.id, pick))
    .returning({
      id: ads.id,
      headline: ads.headline,
      description: ads.description,
      imageUrl: ads.imageUrl,
      ctaText: ads.ctaText,
      ctaUrl: ads.ctaUrl,
      destinationUrl: ads.destinationUrl,
    });
}

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

  async findJobBoostById(id: string): Promise<JobBoostRow | null> {
    const [row] = await this.db.select().from(jobBoosts).where(eq(jobBoosts.id, id)).limit(1);
    return row ?? null;
  }

  /**
   * pending_payment → active with this provider payment id and the run
   * window re-stamped from the payment time, in ONE statement — only when
   * the id isn't already used by any job boost, boost checkout, token pack
   * or course checkout (single-use claim). Returns the activated row only
   * for the call that claimed it.
   */
  async claimJobBoostPayment(
    id: string,
    providerPaymentId: string,
    window: { startsAt: Date; endsAt: Date },
  ): Promise<JobBoostRow | null> {
    const [row] = await this.db
      .update(jobBoosts)
      .set({
        status: "active",
        stripePaymentIntentId: providerPaymentId,
        startsAt: window.startsAt,
        endsAt: window.endsAt,
        updatedAt: window.startsAt,
      })
      .where(
        and(
          eq(jobBoosts.id, id),
          eq(jobBoosts.status, JOB_BOOST_PENDING_STATUS),
          sql`NOT EXISTS (SELECT 1 FROM ${jobBoosts} AS used WHERE used.stripe_payment_intent_id = ${providerPaymentId})`,
          sql`NOT EXISTS (SELECT 1 FROM ${boostCheckouts} WHERE ${boostCheckouts.providerPaymentId} = ${providerPaymentId})`,
          sql`NOT EXISTS (SELECT 1 FROM ${tokenPackPurchases} WHERE ${tokenPackPurchases.stripePaymentIntentId} = ${providerPaymentId})`,
          sql`NOT EXISTS (SELECT 1 FROM ${courseCheckouts} WHERE ${courseCheckouts.providerPaymentId} = ${providerPaymentId})`,
        ),
      )
      .returning();
    return row ?? null;
  }

  /** Owner-scoped status transition guarded on the current status (pause
   *  only an active boost, resume only a paused one — a pending_payment
   *  boost can never be "resumed" into an unpaid active one). */
  async transitionJobBoostStatus(
    id: string,
    userId: string,
    from: string,
    to: string,
  ): Promise<JobBoostRow | null> {
    const [row] = await this.db
      .update(jobBoosts)
      .set({ status: to, updatedAt: new Date() })
      .where(and(eq(jobBoosts.id, id), eq(jobBoosts.userId, userId), eq(jobBoosts.status, from)))
      .returning();
    return row ?? null;
  }

  async markJobSponsored(jobId: string, until: Date): Promise<void> {
    await this.db
      .update(jobItems)
      .set({ sponsored: true, sponsoredUntil: until, sponsoredRankBoost: 10 })
      .where(eq(jobItems.id, jobId));
  }

  async listJobBoostsForUser(userId: string): Promise<JobBoostRow[]> {
    return this.db
      .select()
      .from(jobBoosts)
      .where(eq(jobBoosts.userId, userId))
      .orderBy(desc(jobBoosts.createdAt))
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

  async findJobBoostForOwner(id: string, userId: string): Promise<JobBoostRow | null> {
    const [row] = await this.db.select().from(jobBoosts)
      .where(and(eq(jobBoosts.id, id), eq(jobBoosts.userId, userId)))
      .limit(1);
    return row ?? null;
  }

  async setJobBoostStatus(id: string, status: string): Promise<void> {
    await this.db.update(jobBoosts).set({ status, updatedAt: new Date() }).where(eq(jobBoosts.id, id));
  }

  /** Clear the job's sponsorship (boost cancelled). */
  async unsponsorJob(jobId: string): Promise<void> {
    await this.db
      .update(jobItems)
      .set({ sponsored: false, sponsoredUntil: null, sponsoredRankBoost: 0 })
      .where(eq(jobItems.id, jobId));
  }

  /** Delete the owner's ad; false when not found / not theirs. */
  async deleteAdForOwner(adId: string, userId: string): Promise<boolean> {
    const deleted = await this.db.delete(ads)
      .where(and(eq(ads.id, adId), eq(ads.userId, userId)))
      .returning({ id: ads.id });
    return deleted.length > 0;
  }

  /** Pick one active creative in an active ad set whose placement is one of
   *  `placements` AND count its impression — ONE statement
   *  (`UPDATE … WHERE id IN (SELECT … LIMIT 1) RETURNING …`), not a SELECT
   *  followed by an UPDATE. Null when nothing is servable. */
  async serveAdImpression(placements: string[]): Promise<ServableAd | null> {
    const [row] = await buildServeAdImpression(this.db, placements);
    return row ?? null;
  }
}
