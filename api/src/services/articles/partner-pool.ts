/**
 * Partner Program payout pool + monthly distribution — gap #172.
 *
 * Lifecycle, run by the scheduled.ts cron on the 1st of each month
 * between 00:00 and 04:00 UTC:
 *
 *   1. Open the new period row (idempotent on period_start).
 *   2. Snapshot subscriber revenue for the closing period (last month).
 *   3. Compute pool_total = revenue * pool_funding_bps / 10000.
 *   4. For every article authored by an active partner-program opt-in,
 *      sum engagement (read_seconds, claps, shares) from the
 *      article_engagement rollup, filtered to days inside the period.
 *      Anonymous read seconds are EXCLUDED per #171.
 *   5. Weighted engagement score:
 *           score = read_seconds + 30*claps + 60*shares
 *      (Each clap is "worth" 30 seconds of attention, each share 60.
 *      These weights are tuneable — held in partner_payout_periods.metadata
 *      if/when we want per-period tweaks.)
 *   6. user_share_cents = floor(pool_total * user_score / sum_scores).
 *   7. Write one partner_payouts row per user_id ≥ $0; roll into
 *      partner_program_balances. Once balance crosses $50 → status='paid'
 *      + Tremendous push; otherwise status='held_until_threshold'.
 *
 * The 60-day hold is enforced via `hold_until` on partner_payouts; the
 * dispatch loop only ships rows where `hold_until <= now`.
 */

import { and, eq, gte, lt, sql } from "drizzle-orm";
import { schema } from "../../db/index.js";
import type { Db } from "../../db/index.js";
import { TremendousClient } from "../tremendous/client.js";

type DbClient = Db;

const READ_SECONDS_WEIGHT = 1;
const CLAP_WEIGHT_SECONDS = 30;
const SHARE_WEIGHT_SECONDS = 60;

const MIN_PAYOUT_CENTS = 5_000; // $50 minimum (#172)
const HOLD_DAYS = 60;

export interface PoolCloseResult {
  periodId: string;
  poolTotalCents: number;
  payoutCount: number;
  paidCount: number;
  heldCount: number;
}

export async function closePartnerPoolForLastMonth(args: {
  db: DbClient;
  /** Today, in UTC. The closing period is `[firstOfPrevMonth, firstOfThisMonth)`. */
  now: Date;
  /** Total paid-subscriber revenue for the closing period (cents). Computed
   *  by the caller from invoices/billing — we just snapshot the number. */
  subscriberRevenueCents: number;
  poolFundingBps?: number;
}): Promise<PoolCloseResult> {
  const { db, now, subscriberRevenueCents } = args;
  const poolFundingBps = args.poolFundingBps ?? 50;

  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const periodStart = new Date(Date.UTC(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth() - 1, 1));

  // Idempotent: re-running the cron the same day is a no-op.
  const [period] = await db
    .insert(schema.partnerPayoutPeriods)
    .values({
      periodStart: periodStart.toISOString().slice(0, 10),
      periodEnd: periodEnd.toISOString().slice(0, 10),
      poolFundingBps,
      status: "calculating",
    })
    .onConflictDoUpdate({
      target: schema.partnerPayoutPeriods.periodStart,
      set: { status: "calculating", updatedAt: now },
    })
    .returning();

  const poolTotalCents = Math.floor(subscriberRevenueCents * poolFundingBps / 10000);

  // Aggregate engagement per author for the period.
  const engagementRows = await db
    .select({
      userId: schema.articles.userId,
      readSeconds: sql<number>`COALESCE(SUM(${schema.articleEngagement.readSeconds}), 0)::int`,
      clapCount: sql<number>`COALESCE(SUM(${schema.articleEngagement.clapCount}), 0)::int`,
      shareCount: sql<number>`COALESCE(SUM(${schema.articleEngagement.shareCount}), 0)::int`,
    })
    .from(schema.articleEngagement)
    .innerJoin(schema.articles, eq(schema.articles.id, schema.articleEngagement.articleId))
    .where(
      and(
        gte(schema.articleEngagement.day, periodStart.toISOString().slice(0, 10)),
        lt(schema.articleEngagement.day, periodEnd.toISOString().slice(0, 10)),
        eq(schema.articles.partnerProgramEligible, true),
        eq(schema.articles.status, "published"),
      ),
    )
    .groupBy(schema.articles.userId);

  // Filter to users with an active opt-in row.
  const optIns = await db
    .select({ userId: schema.partnerProgramOptIns.userId })
    .from(schema.partnerProgramOptIns)
    .where(eq(schema.partnerProgramOptIns.isActive, true));
  const eligibleUserIds = new Set(optIns.map((r) => r.userId));

  const scored = engagementRows
    .filter((r) => eligibleUserIds.has(r.userId))
    .map((r) => ({
      userId: r.userId,
      readSeconds: r.readSeconds,
      claps: r.clapCount,
      shares: r.shareCount,
      score:
        r.readSeconds * READ_SECONDS_WEIGHT +
        r.clapCount * CLAP_WEIGHT_SECONDS +
        r.shareCount * SHARE_WEIGHT_SECONDS,
    }));

  const totalScore = scored.reduce((acc, r) => acc + r.score, 0);

  let paidCount = 0;
  let heldCount = 0;
  const holdUntil = new Date(now.getTime() + HOLD_DAYS * 86_400_000);

  for (const r of scored) {
    if (r.score === 0 || totalScore === 0) continue;
    const userShare = Math.floor(poolTotalCents * (r.score / totalScore));
    if (userShare <= 0) continue;

    // Bump the user's running balance.
    const [balance] = await db
      .insert(schema.partnerProgramBalances)
      .values({
        userId: r.userId,
        pendingCents: userShare,
        lastPeriodId: period.id,
      })
      .onConflictDoUpdate({
        target: schema.partnerProgramBalances.userId,
        set: {
          pendingCents: sql`${schema.partnerProgramBalances.pendingCents} + ${userShare}`,
          lastPeriodId: period.id,
          updatedAt: now,
        },
      })
      .returning();

    const crossedThreshold = balance.pendingCents >= MIN_PAYOUT_CENTS;
    const status = crossedThreshold ? "pending" : "held_until_threshold";

    await db.insert(schema.partnerPayouts).values({
      periodId: period.id,
      userId: r.userId,
      engagementScore: r.score,
      readSeconds: r.readSeconds,
      claps: r.claps,
      shares: r.shares,
      userShareCents: userShare,
      holdUntil,
      status,
    });

    if (crossedThreshold) paidCount++;
    else heldCount++;
  }

  await db
    .update(schema.partnerPayoutPeriods)
    .set({
      subscriberRevenueCents,
      poolTotalCents,
      totalEngagementScore: totalScore,
      closedAt: now,
      status: "closed",
      updatedAt: now,
    })
    .where(eq(schema.partnerPayoutPeriods.id, period.id));

  return { periodId: period.id, poolTotalCents, payoutCount: paidCount + heldCount, paidCount, heldCount };
}

/**
 * Dispatch loop — sends a Tremendous gift card to every payout row that
 * (a) is `pending`, (b) is past `hold_until`, and (c) belongs to a user
 * with `recipient_email` set on the most recent opt-in row.
 */
export async function dispatchDuePartnerPayouts(args: {
  db: DbClient;
  tremendous: TremendousClient;
  now: Date;
}): Promise<{ dispatched: number; failed: number }> {
  const { db, tremendous, now } = args;
  const due = await db
    .select({
      id: schema.partnerPayouts.id,
      userId: schema.partnerPayouts.userId,
      userShareCents: schema.partnerPayouts.userShareCents,
    })
    .from(schema.partnerPayouts)
    .where(
      and(
        eq(schema.partnerPayouts.status, "pending"),
        lt(schema.partnerPayouts.holdUntil, now),
      ),
    )
    .limit(50);

  let dispatched = 0;
  let failed = 0;
  for (const row of due) {
    const [user] = await db
      .select({ name: schema.users.name, email: schema.users.email })
      .from(schema.users)
      .where(eq(schema.users.id, row.userId))
      .limit(1);
    if (!user?.email) {
      await db
        .update(schema.partnerPayouts)
        .set({ status: "failed", failureReason: "missing recipient email", updatedAt: now })
        .where(eq(schema.partnerPayouts.id, row.id));
      failed++;
      continue;
    }
    try {
      const order = await tremendous.createOrder({
        externalId: row.id,
        recipientName: user.name ?? "Partner",
        recipientEmail: user.email,
        amountDollars: row.userShareCents / 100,
        message: "Your hired.video Partner Program payout — thanks for writing!",
      });
      await db
        .update(schema.partnerPayouts)
        .set({
          status: "paid",
          tremendousOrderId: order.orderId,
          paidAt: now,
          updatedAt: now,
        })
        .where(eq(schema.partnerPayouts.id, row.id));
      await db
        .update(schema.partnerProgramBalances)
        .set({
          pendingCents: sql`${schema.partnerProgramBalances.pendingCents} - ${row.userShareCents}`,
          paidCents: sql`${schema.partnerProgramBalances.paidCents} + ${row.userShareCents}`,
          updatedAt: now,
        })
        .where(eq(schema.partnerProgramBalances.userId, row.userId));
      dispatched++;
    } catch (e) {
      await db
        .update(schema.partnerPayouts)
        .set({
          status: "failed",
          failureReason: e instanceof Error ? e.message : String(e),
          updatedAt: now,
        })
        .where(eq(schema.partnerPayouts.id, row.id));
      failed++;
    }
  }

  return { dispatched, failed };
}
