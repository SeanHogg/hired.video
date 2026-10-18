/**
 * PaidMediaInsightsRepository — bulk persistence for `paid_media_insights`
 * (one row per platform × externalId × resourceKind × day).
 *
 * Insight pulls return hundreds of rows per account; the previous
 * per-row upsert cost one neon-http round-trip each. This writes them as
 * multi-row `INSERT … ON CONFLICT DO UPDATE` statements chunked at 500.
 */

import { and, desc, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import { schema } from "../db/index.js";
import { chunk } from "../utils/chunk.js";
import { paidMediaAccountsOwnedBy } from "./paidMediaAccountsRepository.js";

const { paidMediaInsights, paidMediaAccounts } = schema;

export type DbLike = any;
export type PaidMediaInsightInsert = typeof paidMediaInsights.$inferInsert;
export type PaidMediaInsightRow = typeof paidMediaInsights.$inferSelect;

export interface InsightListFilter {
  /** Personal owners + companies whose ad accounts the caller may read. */
  ownerUserIds: string[];
  ownerCompanyIds: string[];
  since?: string;
  until?: string;
  internalId?: string;
}

export const INSIGHT_UPSERT_CHUNK = 500;

export interface IPaidMediaInsightsRepository {
  /** Upsert many insight rows. Rows sharing a conflict key are collapsed
   *  last-wins first (Postgres rejects touching one row twice per
   *  statement), matching the old sequential per-row upserts. On conflict
   *  only the metric columns + fetched_at are refreshed (internal_id and
   *  account_id keep their first-written values). */
  upsertMany(rows: PaidMediaInsightInsert[], fetchedAt: Date): Promise<void>;
  /** Insight rows of ad accounts owned by the given workspaces, newest day first. */
  listForOwners(filter: InsightListFilter): Promise<PaidMediaInsightRow[]>;
}

export class PaidMediaInsightsRepository implements IPaidMediaInsightsRepository {
  constructor(private readonly db: DbLike) {}

  async upsertMany(rows: PaidMediaInsightInsert[], fetchedAt: Date): Promise<void> {
    if (rows.length === 0) return;
    const byKey = new Map<string, PaidMediaInsightInsert>();
    for (const r of rows) {
      byKey.set(JSON.stringify([r.platform, r.externalId, r.resourceKind, r.date]), r);
    }
    const deduped = [...byKey.values()];
    for (const rowsChunk of chunk(deduped, INSIGHT_UPSERT_CHUNK)) {
      await this.db
        .insert(paidMediaInsights)
        .values(rowsChunk)
        .onConflictDoUpdate({
          target: [
            paidMediaInsights.platform,
            paidMediaInsights.externalId,
            paidMediaInsights.resourceKind,
            paidMediaInsights.date,
          ],
          set: {
            impressions: sql`excluded.impressions`,
            clicks: sql`excluded.clicks`,
            spendCents: sql`excluded.spend_cents`,
            conversions: sql`excluded.conversions`,
            videoViews: sql`excluded.video_views`,
            rawMetrics: sql`excluded.raw_metrics`,
            fetchedAt,
          },
        });
    }
  }

  async listForOwners(filter: InsightListFilter): Promise<PaidMediaInsightRow[]> {
    const ownedAccountIds = this.db
      .select({ id: paidMediaAccounts.id })
      .from(paidMediaAccounts)
      .where(paidMediaAccountsOwnedBy(filter.ownerUserIds, filter.ownerCompanyIds));
    const conds: SQL[] = [inArray(paidMediaInsights.accountId, ownedAccountIds)];
    if (filter.since) conds.push(gte(paidMediaInsights.date, filter.since));
    if (filter.until) conds.push(lte(paidMediaInsights.date, filter.until));
    if (filter.internalId) conds.push(eq(paidMediaInsights.internalId, filter.internalId));
    return this.db
      .select()
      .from(paidMediaInsights)
      .where(and(...conds))
      .orderBy(desc(paidMediaInsights.date));
  }
}
