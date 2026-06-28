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

import { and, count, eq, gte, sql } from "drizzle-orm";
import { schema, type getDb } from "../../db/index.js";
import type { Repos } from "../../repositories/index.js";
import { evaluate as evaluateFraud } from "../../domains/gamification/fraud-engine.js";

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

  for (const row of candidateRows as Array<{ userId: string }>) {
    result.scanned += 1;
    try {
      const flags = await evaluateOne(repos, db, row.userId, now());
      if (flags.length > 0) {
        result.flagged += 1;
        for (const f of flags) {
          await repos.points.insertFraudFlag({
            userId: row.userId,
            kind: f.kind,
            severity: f.severity,
            evidence: f.evidence,
            autoSuspended: f.autoSuspend,
          });
          if (f.autoSuspend) {
            result.autoSuspended += 1;
            await repos.points.setSuspension(
              row.userId,
              true,
              `auto (sweep): ${f.kind}`,
              null,
            );
          }
        }
      }
    } catch (e) {
      console.error("[fraud-sweep] user failed", row.userId, e);
      result.errors += 1;
    }
  }

  return result;
}

async function evaluateOne(
  repos: Repos,
  db: Db,
  userId: string,
  now: Date,
) {
  const dayMs = 24 * 60 * 60 * 1000;
  const dayCutoff = new Date(now.getTime() - dayMs);

  // 24h redemption value (sum value_cents on rows in pending/queued/
  // fulfilled in the window — cancelled/failed don't count).
  const redemptionRows = await db
    .select({ valueCents: schema.pointRedemptions.valueCents })
    .from(schema.pointRedemptions)
    .where(
      and(
        eq(schema.pointRedemptions.userId, userId),
        gte(schema.pointRedemptions.createdAt, dayCutoff),
        sql`${schema.pointRedemptions.status} IN ('pending','queued','fulfilled')`,
      ),
    );
  const redemptionsLast24hValueCents = (redemptionRows as Array<{ valueCents: number }>).reduce(
    (s, r) => s + r.valueCents,
    0,
  );

  // Signup-IP cluster size. Look up this user's signupIp, then count
  // other users with the same ip.
  const [u] = await db
    .select({ signupIp: schema.users.signupIp })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  let accountsOnSignupIp = 0;
  if ((u as { signupIp: string | null } | undefined)?.signupIp) {
    const [{ c }] = await db
      .select({ c: count() })
      .from(schema.users)
      .where(
        and(
          eq(schema.users.signupIp, (u as { signupIp: string }).signupIp),
          sql`${schema.users.id} != ${userId}`,
        ),
      );
    accountsOnSignupIp = (c as number) ?? 0;
  }

  // Refund count is best-effort: tokenPackPurchases.status = 'refunded'
  // since the user's first earn. Phase-4 sketch only — full Stripe
  // refund webhook wiring lives outside gamification.
  const [refundRow] = await db
    .select({ c: count() })
    .from(schema.tokenPackPurchases)
    .where(
      and(
        eq(schema.tokenPackPurchases.userId, userId),
        eq(schema.tokenPackPurchases.status, "refunded"),
      ),
    );
  const refundsSinceFirstEarn = ((refundRow as { c: number } | undefined)?.c) ?? 0;

  // #1117 — device-fingerprint cluster size. Sourced from the same repo
  // helper the live award path uses (counts OTHER accounts sharing any of
  // this user's session device fingerprints). Best-effort: a query failure
  // leaves the value undefined so the heuristic no-ops rather than aborting
  // the whole sweep for one user.
  let accountsOnDeviceFingerprint: number | undefined;
  try {
    accountsOnDeviceFingerprint = await repos.points.countAccountsOnDeviceFingerprint(userId);
  } catch {
    accountsOnDeviceFingerprint = undefined;
  }

  // Re-use the per-minute close buckets the engine already shapes;
  // pass empty arrays since the burst heuristic only fires inline (we
  // don't need to re-evaluate it here — it auto-suspends synchronously).
  return evaluateFraud({
    userId,
    recentUserTaskClosesPerMinute: [],
    recentUserTaskClosesLastHour: 0,
    earningDayBuckets24h: 1,
    recentLedgerSample: [],
    redemptionsLast24hValueCents,
    accountsOnSignupIp,
    accountsOnDeviceFingerprint,
    refundsSinceFirstEarn,
  });
}
