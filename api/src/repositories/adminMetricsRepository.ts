/**
 * AdminMetricsRepository — time-bucketed aggregate reads for the
 * SuperAdmin product dashboard (`routes/admin.ts`).
 *
 * Every series here is ONE grouped query (neon-http makes each query a
 * full HTTP round-trip, so the previous "one COUNT per bucket" loops cost
 * 13–30 sequential round-trips per request). Buckets with no rows are
 * zero-filled in memory by the caller-facing methods so the output shape
 * is identical to the old per-bucket loops.
 *
 * Buckets are RELATIVE windows anchored at `now` (not calendar weeks/days)
 * to preserve the original semantics exactly:
 *   bucket k  ⇔  createdAt ∈ [now − k·size, now − (k−1)·size)
 *             ⇔  ceil((now − createdAt) / size) = k
 */

import { and, eq, gte, lt, lte, sql, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { schema } from "../db/index.js";

export type DbLike = any;

const { users, jobItems, subscriptions, subscriptionPlans, resumeInformation, systemSettings } = schema;

/** Entities the daily time-series endpoint can chart. */
export type AdminTimeSeriesMetric = "users" | "jobs" | "resumes" | "subscriptions";

const CREATED_AT_BY_METRIC: Record<AdminTimeSeriesMetric, { table: PgTable; createdAt: PgColumn }> = {
  users: { table: users, createdAt: users.createdAt },
  jobs: { table: jobItems, createdAt: jobItems.createdAt },
  resumes: { table: resumeInformation, createdAt: resumeInformation.createdAt },
  subscriptions: { table: subscriptions, createdAt: subscriptions.createdAt },
};

export function isAdminTimeSeriesMetric(m: string): m is AdminTimeSeriesMetric {
  return Object.prototype.hasOwnProperty.call(CREATED_AT_BY_METRIC, m);
}

export interface IAdminMetricsRepository {
  /** Count rows per relative bucket k ∈ [minK, maxK]; returns Map<k, count>
   *  (missing buckets absent — caller zero-fills). */
  countByRelativeBuckets(
    metric: AdminTimeSeriesMetric,
    now: Date,
    bucketMs: number,
    minK: number,
    maxK: number,
  ): Promise<Map<number, number>>;
  /** Cumulative active-subscription MRR + count at each cutoff
   *  (createdAt <= cutoff), in cutoff order. Cutoffs must be ascending. */
  activeSubscriptionsAtCutoffs(cutoffs: Date[]): Promise<Array<{ mrr: number; subscribers: number }>>;
  /** Multi-row upsert of system settings (key → value). */
  upsertSystemSettings(entries: Array<[string, string | null]>): Promise<void>;
}

export class AdminMetricsRepository implements IAdminMetricsRepository {
  constructor(private readonly db: DbLike, private readonly now: () => Date = () => new Date()) {}

  async countByRelativeBuckets(
    metric: AdminTimeSeriesMetric,
    now: Date,
    bucketMs: number,
    minK: number,
    maxK: number,
  ): Promise<Map<number, number>> {
    const { table, createdAt } = CREATED_AT_BY_METRIC[metric];
    const nowSec = now.getTime() / 1000;
    const sizeSec = bucketMs / 1000;
    const from = new Date(now.getTime() - maxK * bucketMs);
    const to = new Date(now.getTime() - (minK - 1) * bucketMs);
    const bucket = sql<number>`ceil((${nowSec}::float8 - extract(epoch from ${createdAt})) / ${sizeSec}::float8)::int`;
    const rows: Array<{ k: number; n: number }> = await this.db
      .select({ k: bucket, n: sql<number>`count(*)::int` })
      .from(table)
      .where(and(gte(createdAt, from), lt(createdAt, to)))
      // Ordinal GROUP BY: the bucket expression carries bind params, and
      // Postgres won't match a re-parameterized copy of it in GROUP BY.
      .groupBy(sql`1`);
    const out = new Map<number, number>();
    for (const r of rows) out.set(Number(r.k), Number(r.n));
    return out;
  }

  async activeSubscriptionsAtCutoffs(cutoffs: Date[]): Promise<Array<{ mrr: number; subscribers: number }>> {
    if (cutoffs.length === 0) return [];
    // Assign each active subscription to the FIRST cutoff it falls under,
    // then prefix-sum in memory — identical to N cumulative `<= cutoff`
    // queries, in one round-trip.
    const whens: SQL[] = cutoffs.map((c, i) => sql`WHEN ${subscriptions.createdAt} <= ${c} THEN ${i}`);
    const bucket = sql<number>`(CASE ${sql.join(whens, sql` `)} END)::int`;
    const rows: Array<{ k: number; total: string | number | null; n: number }> = await this.db
      .select({
        k: bucket,
        total: sql<string | null>`sum(${subscriptionPlans.priceMonthly})`,
        n: sql<number>`count(*)::int`,
      })
      .from(subscriptions)
      .innerJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
      .where(and(eq(subscriptions.status, "active"), lte(subscriptions.createdAt, cutoffs[cutoffs.length - 1])))
      // Ordinal GROUP BY: the bucket expression carries bind params, and
      // Postgres won't match a re-parameterized copy of it in GROUP BY.
      .groupBy(sql`1`);
    const byBucket = new Map<number, { total: number; n: number }>();
    for (const r of rows) byBucket.set(Number(r.k), { total: Number(r.total ?? 0), n: Number(r.n) });
    let mrr = 0;
    let subscribers = 0;
    return cutoffs.map((_, i) => {
      const b = byBucket.get(i);
      if (b) {
        mrr += b.total;
        subscribers += b.n;
      }
      return { mrr, subscribers };
    });
  }

  async upsertSystemSettings(entries: Array<[string, string | null]>): Promise<void> {
    if (entries.length === 0) return;
    const ts = this.now();
    await this.db
      .insert(systemSettings)
      .values(entries.map(([key, value]) => ({ key, value, updatedAt: ts })))
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value: sql`excluded.value`, updatedAt: sql`excluded.updated_at` },
      });
  }
}
