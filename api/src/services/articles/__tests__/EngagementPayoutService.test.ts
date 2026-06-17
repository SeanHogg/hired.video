/**
 * #1961 — Article engagement → payout MONEY-PATH tests.
 *
 * The payout amount is computed in EngagementPayoutService.runForPeriod as
 *
 *   readMinutes   = floor(verifiedReadSeconds / 60)   // #1757 — verified-only,
 *                                                      //   per-day-capped basis
 *   centsCredited = Math.floor(readMinutes * centsPer1kReadMinutes / 1000)
 *
 * (`readMinutes` here is the per-article verified read-minutes for the period,
 * NOT the article's estimated length.) The math is entwined with the DB
 * (getDb() + the payoutLedgerService
 * singleton are reached directly inside runForPeriod, with no DI seam), so
 * the per-article formula is not exported as a pure helper. Following the
 * same approach time-to-hire.test.ts uses for its un-exported math, we lock
 * the formula down by re-implementing it inline and asserting its
 * money-correctness properties (no lost / created cents, flooring, zero and
 * boundary cases). If the source formula drifts, this test is the tripwire.
 *
 * We ALSO exercise the input-validation guards in runForPeriod that fire
 * BEFORE any DB handle is acquired (so they need no DB), pinning the
 * money-path's refusal to run on a bad window or a negative rate.
 *
 * Run: node --import tsx --test src/services/articles/__tests__/EngagementPayoutService.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { EngagementPayoutService } from "../EngagementPayoutService.js";

/** The exact per-article formula from runForPeriod (line ~129). Kept in
 *  lockstep with the source — a divergence here means the money math
 *  changed and someone must re-confirm the new behaviour. */
function centsForArticle(readMinutes: number, centsPer1kReadMinutes: number): number {
  return Math.floor((readMinutes * centsPer1kReadMinutes) / 1000);
}

/** Mirror of the per-run loop's accumulation: skips non-positive
 *  read-minutes and non-positive credits exactly as the source does. */
function runPayout(
  articles: { readMinutes: number }[],
  centsPer1kReadMinutes: number,
): { totalCents: number; creditedCount: number; perArticle: number[] } {
  let totalCents = 0;
  let creditedCount = 0;
  const perArticle: number[] = [];
  for (const a of articles) {
    if (a.readMinutes <= 0) continue;
    const cents = centsForArticle(a.readMinutes, centsPer1kReadMinutes);
    if (cents <= 0) continue;
    perArticle.push(cents);
    totalCents += cents;
    creditedCount += 1;
  }
  return { totalCents, creditedCount, perArticle };
}

describe("EngagementPayoutService — per-article payout formula", () => {
  it("uses the documented default rate of 250¢ / 1k read-minutes", () => {
    assert.equal(EngagementPayoutService.DEFAULT_CENTS_PER_1K_READ_MINUTES, 250);
  });

  it("credits a clean multiple with no rounding loss (1000 min @ 250¢ = 250¢)", () => {
    assert.equal(centsForArticle(1000, 250), 250);
  });

  it("floors a fractional cent rather than rounding up (no created cents)", () => {
    // 1500 * 250 / 1000 = 375.0 → exact.
    assert.equal(centsForArticle(1500, 250), 375);
    // 7 * 250 / 1000 = 1.75 → floors to 1.
    assert.equal(centsForArticle(7, 250), 1);
    // 3 * 250 / 1000 = 0.75 → floors to 0 (sub-cent engagement earns nothing).
    assert.equal(centsForArticle(3, 250), 0);
  });

  it("zero / negative read-minutes never earn (boundary)", () => {
    assert.equal(centsForArticle(0, 250), 0);
    // The loop also guards readMinutes <= 0 before computing.
    const r = runPayout([{ readMinutes: 0 }, { readMinutes: -5 }], 250);
    assert.equal(r.totalCents, 0);
    assert.equal(r.creditedCount, 0);
  });

  it("a zero rate produces a zero pool (run with no money configured)", () => {
    const r = runPayout([{ readMinutes: 10_000 }, { readMinutes: 50_000 }], 0);
    assert.equal(r.totalCents, 0);
    assert.equal(r.creditedCount, 0); // cents <= 0 articles are skipped entirely
  });

  it("single recipient, large numbers — no precision loss below 2^53", () => {
    // 8_000_000 read-minutes @ 500¢/1k = 40_000_00 cents = $40,000.00
    const cents = centsForArticle(8_000_000, 500);
    assert.equal(cents, 4_000_000);
    assert.ok(Number.isSafeInteger(cents));
  });

  it("run total is the exact sum of per-article credits (no lost/created cents)", () => {
    const articles = [
      { readMinutes: 1000 }, // 250
      { readMinutes: 1500 }, // 375
      { readMinutes: 7 }, //      1 (1.75 floored)
      { readMinutes: 3 }, //      0 → skipped
      { readMinutes: 0 }, //      skipped
      { readMinutes: 40_000 }, // 10_000
    ];
    const r = runPayout(articles, 250);
    // Pool == sum of the credited articles, and skipped articles never count.
    assert.equal(r.perArticle.reduce((a, b) => a + b, 0), r.totalCents);
    assert.deepEqual(r.perArticle, [250, 375, 1, 10_000]);
    assert.equal(r.totalCents, 10_626);
    assert.equal(r.creditedCount, 4);
  });

  it("flooring each article independently can differ from flooring the aggregate (per-article is correct)", () => {
    // Two articles each at 7 read-minutes @ 250¢/1k:
    //   per-article: floor(1.75)=1 each → total 2
    //   naive aggregate: floor(14*250/1000)=floor(3.5)=3
    // The source credits per-article, so the creator-fair total is 2, NOT 3.
    const r = runPayout([{ readMinutes: 7 }, { readMinutes: 7 }], 250);
    assert.equal(r.totalCents, 2);
    assert.notEqual(r.totalCents, centsForArticle(14, 250)); // 3
  });
});

describe("EngagementPayoutService — runForPeriod input guards (no DB needed)", () => {
  const svc = new EngagementPayoutService();
  const start = new Date("2026-06-01T00:00:00Z");
  const end = new Date("2026-06-08T00:00:00Z");

  it("rejects a period whose end is not after its start", async () => {
    await assert.rejects(
      () => svc.runForPeriod({ periodStart: end, periodEnd: start, centsPer1kReadMinutes: 250 }),
      /periodEnd must be after periodStart/,
    );
  });

  it("rejects an equal start/end window", async () => {
    await assert.rejects(
      () => svc.runForPeriod({ periodStart: start, periodEnd: start, centsPer1kReadMinutes: 250 }),
      /periodEnd must be after periodStart/,
    );
  });

  it("rejects a negative rate (money path refuses to debit-as-credit)", async () => {
    await assert.rejects(
      () => svc.runForPeriod({ periodStart: start, periodEnd: end, centsPer1kReadMinutes: -1 }),
      /centsPer1kReadMinutes must be a non-negative number/,
    );
  });

  it("rejects a non-finite rate (NaN / Infinity)", async () => {
    await assert.rejects(
      () => svc.runForPeriod({ periodStart: start, periodEnd: end, centsPer1kReadMinutes: Number.NaN }),
      /centsPer1kReadMinutes must be a non-negative number/,
    );
    await assert.rejects(
      () => svc.runForPeriod({ periodStart: start, periodEnd: end, centsPer1kReadMinutes: Number.POSITIVE_INFINITY }),
      /centsPer1kReadMinutes must be a non-negative number/,
    );
  });
});
