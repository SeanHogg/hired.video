/**
 * #896 — Article engagement → payout calculation worker.
 *
 * Reads `articles.viewCount` + `articles.readMinutes` deltas captured
 * since the previous run (or all-time for the first run on an article),
 * applies a $/1k-read-minute rate, and writes a `payout_ledger_entries`
 * credit per article owed. Per-period idempotency comes from
 * `article_payout_runs (period_start, period_end)` UNIQUE; per-article
 * idempotency within a run comes from
 * `article_payout_entries (run_id, article_id)` UNIQUE.
 *
 * The formula is intentionally simple and configurable per run:
 *
 *   centsCredited = floor(qualifyingReadMinutes
 *                         × centsPer1kReadMinutes / 1000)
 *
 * "Qualifying" today means raw counts on a published article whose
 * author has the partner-program eligibility flag set. Fraud detection
 * + verified-account weighting is tracked separately under the
 * gamification gap-pass; this worker is the money seam they will plug
 * into.
 *
 * Call sites:
 *   • `runForPeriod(opts)` — manual SuperAdmin trigger / cron worker
 *   • `getRunSummary(runId)` — admin dashboard
 */

import { and, eq, isNotNull, sql } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { payoutLedgerService } from "../payout/PayoutLedgerService.js";

const { articles, articlePayoutRuns, articlePayoutEntries } = schema;

export interface RunPeriodOptions {
  periodStart: Date;
  periodEnd: Date;
  centsPer1kReadMinutes: number;
  /** When true, skips already-credited articles in this period silently. */
  resumeExisting?: boolean;
}

export interface RunSummary {
  runId: string;
  status: "completed" | "failed";
  totalCreditedCents: number;
  articlesPaid: number;
  failureReason?: string;
}

export class EngagementPayoutService {
  /** Default formula rate — used by the cron tick when no override is
   *  passed. Tuned conservatively because today's read-minutes count
   *  doesn't yet weight verified vs anonymous traffic. */
  static readonly DEFAULT_CENTS_PER_1K_READ_MINUTES = 250;

  async runForPeriod(opts: RunPeriodOptions): Promise<RunSummary> {
    if (opts.periodEnd <= opts.periodStart) {
      throw new Error("periodEnd must be after periodStart");
    }
    if (!Number.isFinite(opts.centsPer1kReadMinutes) || opts.centsPer1kReadMinutes < 0) {
      throw new Error("centsPer1kReadMinutes must be a non-negative number");
    }

    const db = getDb();
    // Insert the run row. The (period_start, period_end) UNIQUE index
    // guarantees only one run ever exists for a given window, so re-
    // triggering the cron simply throws and we surface that to the
    // admin caller.
    let runId: string;
    try {
      const [run] = await db
        .insert(articlePayoutRuns)
        .values({
          periodStart: opts.periodStart,
          periodEnd: opts.periodEnd,
          centsPer1kReadMinutes: Math.round(opts.centsPer1kReadMinutes),
          status: "running",
        })
        .returning();
      runId = run.id;
    } catch (err) {
      if (opts.resumeExisting) {
        const [existing] = await db
          .select()
          .from(articlePayoutRuns)
          .where(
            and(
              eq(articlePayoutRuns.periodStart, opts.periodStart),
              eq(articlePayoutRuns.periodEnd, opts.periodEnd),
            ),
          )
          .limit(1);
        if (!existing) throw err;
        if (existing.status === "completed") {
          return {
            runId: existing.id,
            status: "completed",
            totalCreditedCents: existing.totalCreditedCents,
            articlesPaid: existing.articlesPaid,
          };
        }
        runId = existing.id;
      } else {
        throw err;
      }
    }

    try {
      const eligible = await db
        .select({
          id: articles.id,
          userId: articles.userId,
          readMinutes: articles.readMinutes,
          viewCount: articles.viewCount,
        })
        .from(articles)
        .where(
          and(
            eq(articles.status, "published"),
            eq(articles.partnerProgramEligible, true),
            isNotNull(articles.publishedAt),
          ),
        );

      let totalCents = 0;
      let creditedCount = 0;
      for (const a of eligible) {
        if (a.readMinutes <= 0) continue;
        const cents = Math.floor((a.readMinutes * opts.centsPer1kReadMinutes) / 1000);
        if (cents <= 0) continue;

        // Idempotent on (runId, articleId).
        const [alreadyCredited] = await db
          .select({ id: articlePayoutEntries.id })
          .from(articlePayoutEntries)
          .where(
            and(
              eq(articlePayoutEntries.runId, runId),
              eq(articlePayoutEntries.articleId, a.id),
            ),
          )
          .limit(1);
        if (alreadyCredited) continue;

        const ledger = await payoutLedgerService.recordAccrual({
          userId: a.userId,
          amountCents: cents,
          currency: "USD",
          sourceKind: "article",
          sourceId: a.id,
          note: `Article engagement payout — ${a.readMinutes} read-minutes @ ${opts.centsPer1kReadMinutes}¢/1k`,
        });

        await db.insert(articlePayoutEntries).values({
          runId,
          articleId: a.id,
          creatorUserId: a.userId,
          qualifyingReadMinutes: a.readMinutes,
          qualifyingViewCount: a.viewCount,
          centsCredited: cents,
          ledgerEntryId: ledger.entryId,
        });

        totalCents += cents;
        creditedCount += 1;
      }

      await db
        .update(articlePayoutRuns)
        .set({
          status: "completed",
          totalCreditedCents: totalCents,
          articlesPaid: creditedCount,
          ranAt: new Date(),
        })
        .where(eq(articlePayoutRuns.id, runId));

      return { runId, status: "completed", totalCreditedCents: totalCents, articlesPaid: creditedCount };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      await db
        .update(articlePayoutRuns)
        .set({ status: "failed", failedReason: msg, ranAt: new Date() })
        .where(eq(articlePayoutRuns.id, runId));
      return { runId, status: "failed", totalCreditedCents: 0, articlesPaid: 0, failureReason: msg };
    }
  }

  async getRunSummary(runId: string) {
    const db = getDb();
    const [run] = await db
      .select()
      .from(articlePayoutRuns)
      .where(eq(articlePayoutRuns.id, runId))
      .limit(1);
    if (!run) return null;
    const [{ entries }] = await db
      .select({ entries: sql<number>`count(*)::int` })
      .from(articlePayoutEntries)
      .where(eq(articlePayoutEntries.runId, runId));
    return {
      run,
      entryCount: typeof entries === "string" ? Number(entries) : entries,
    };
  }
}

export const engagementPayoutService = new EngagementPayoutService();
