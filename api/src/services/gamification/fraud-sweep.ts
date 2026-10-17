/**
 * Nightly fraud sweep. Iterates all users with non-zero balance OR
 * recent redemption activity, aggregates the Phase-4 signals (refund
 * count, signup-IP cluster size, redemption value-in-24h), feeds them
 * to the fraud engine, and writes flags + optional auto-suspend rows
 * via the points repository.
 *
 * Scheduled in [wrangler.toml](hired.video/api/wrangler.toml) as a
 * Cloudflare Cron Trigger (04:30 UTC daily — well past the close of
 * business in PT but before the morning EU window). The Worker entry
 * routes `scheduled` events here.
 *
 * Pure orchestration: it composes pointsRepository + jobs/tokens repos
 * (for refund / chargeback counts) + the existing fraud engine. No new
 * heuristics here — the engine remains the single source.
 */

import { sql } from "drizzle-orm";
import { schema, type getDb } from "../../db/index.js";
import { FraudSignalsRepository } from "../../repositories/fraudSignalsRepository.js";
import { chunk } from "../../utils/chunk.js";
import type { Repos } from "../../repositories/index.js";
import { evaluate as evaluateFraud } from "../../domains/gamification/fraud-engine.js";
import { logger } from "../../lib/logger.js";

/** The DB handle exposed by `getDb()`. Drizzle's query-chain types are
 *  not round-trip stable across minor versions, but the call-site
 *  signature ("a Drizzle DB you can `.select()` from") is — typing the
 *  parameter against `ReturnType<typeof getDb>` documents the contract
 *  without the previous `unknown` + `as any` two-step. */
type Db = ReturnType<typeof getDb>;

export interface FraudSweepResult {
  scanned: number;
  flagged: number;
  autoSuspended: number;
  errors: number;
}

export async function runFraudSweep(
  repos: Repos,
  db: Db,
  opts: { now?: () => Date; userLimit?: number } = {},
): Promise<FraudSweepResult> {
  const now = opts.now ?? (() => new Date());
  const userLimit = opts.userLimit ?? 5000;

  // Pull users with any positive balance or any redemption since
  // yesterday — that's the universe at risk for the Phase-4 heuristics.
  const candidateRows = await db
    .select({ userId: schema.userPointsBalance.userId })
    .from(schema.userPointsBalance)
    .where(sql`${schema.userPointsBalance.balance} > 0 OR ${schema.userPointsBalance.lifetimeRedeemed} > 0`)
    .limit(userLimit);

  const result: FraudSweepResult = { scanned: 0, flagged: 0, autoSuspended: 0, errors: 0 };
  const signalsRepo = new FraudSignalsRepository(db);
  const userIds = (candidateRows as Array<{ userId: string }>).map((r) => r.userId);

  // Signals are READ in batches (constant queries per SIGNAL_BATCH users,
  // was 4-6 point queries per user). Flag/suspension WRITES stay per user
  // inside the per-user try/catch so one failure never aborts the sweep.
  for (const batch of chunk(userIds, SIGNAL_BATCH)) {
    let signals: Map<string, FraudSignalInputs>;
    try {
      signals = await loadSignals(signalsRepo, batch, now());
    } catch (e) {
      // Same isolation as the per-user reads: the users whose signals
      // couldn't be read count as errors; the sweep continues.
      logger.error("[fraud-sweep] signal batch failed", { batchSize: batch.length, error: e });
      result.scanned += batch.length;
      result.errors += batch.length;
      continue;
    }

    for (const userId of batch) {
      result.scanned += 1;
      try {
        const flags = evaluateFraud({
          userId,
          // Re-use the per-minute close buckets the engine already shapes;
          // pass empty arrays since the burst heuristic only fires inline (we
          // don't need to re-evaluate it here — it auto-suspends synchronously).
          recentUserTaskClosesPerMinute: [],
          recentUserTaskClosesLastHour: 0,
          earningDayBuckets24h: 1,
          recentLedgerSample: [],
          ...signals.get(userId)!,
        });
        if (flags.length > 0) {
          result.flagged += 1;
          for (const f of flags) {
            await repos.points.insertFraudFlag({
              userId,
              kind: f.kind,
              severity: f.severity,
              evidence: f.evidence,
              autoSuspended: f.autoSuspend,
            });
            if (f.autoSuspend) {
              result.autoSuspended += 1;
              await repos.points.setSuspension(
                userId,
                true,
                `auto (sweep): ${f.kind}`,
                null,
              );
            }
          }
        }
      } catch (e) {
        logger.error("[fraud-sweep] user failed", { userId, error: e });
        result.errors += 1;
      }
    }
  }

  return result;
}

const SIGNAL_BATCH = 500;

interface FraudSignalInputs {
  redemptionsLast24hValueCents: number;
  accountsOnSignupIp: number;
  accountsOnDeviceFingerprint: number | undefined;
  refundsSinceFirstEarn: number;
}

async function loadSignals(
  repo: FraudSignalsRepository,
  userIds: string[],
  now: Date,
): Promise<Map<string, FraudSignalInputs>> {
  const dayCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [redemptions, signupIp, refunds, devices] = await Promise.all([
    // 24h redemption value (pending/queued/fulfilled — cancelled/failed don't count).
    repo.redemptionValueSince(userIds, dayCutoff),
    // Signup-IP cluster size: OTHER users sharing the user's signup IP.
    repo.accountsOnSignupIp(userIds),
    // Refund count is best-effort: tokenPackPurchases.status = 'refunded'.
    // Phase-4 sketch only — full Stripe refund webhook wiring lives outside
    // gamification.
    repo.refundCounts(userIds),
    // #1117 — device-fingerprint cluster size (same semantics as
    // PointsRepository.countAccountsOnDeviceFingerprint). Best-effort: a
    // query failure leaves the value undefined so the heuristic no-ops
    // rather than aborting the sweep.
    repo.accountsOnDeviceFingerprint(userIds).catch(() => null),
  ]);
  const out = new Map<string, FraudSignalInputs>();
  for (const userId of userIds) {
    out.set(userId, {
      redemptionsLast24hValueCents: redemptions.get(userId) ?? 0,
      accountsOnSignupIp: signupIp.get(userId) ?? 0,
      accountsOnDeviceFingerprint: devices ? devices.get(userId) ?? 0 : undefined,
      refundsSinceFirstEarn: refunds.get(userId) ?? 0,
    });
  }
  return out;
}
