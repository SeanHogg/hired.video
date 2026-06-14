/**
 * Creator earnings rollup folding tests (#1185).
 *
 * `buildEarningsRollup` is the single grouping implementation shared by the
 * PayoutLedgerService aggregator (real DB rows) and the frontend DTO. It folds
 * raw per-`source_kind` ledger aggregates into the human-facing revenue buckets
 * and must: collapse related kinds (promo project + extra revision), drop empty
 * sources, keep a stable display order, route unknown kinds to `other` without
 * losing dollars, and total correctly.
 *
 * Run: node --import tsx --test shared/__tests__/creator-earnings.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildEarningsRollup, EARNINGS_SOURCE_ORDER } from "../creator-earnings.js";

describe("buildEarningsRollup", () => {
  it("folds promo project + paid extra revision into a single 'Promo videos' row", () => {
    const rollup = buildEarningsRollup(
      [
        { sourceKind: "promo_project", earningsCents: 9000, salesCount: 2 },
        { sourceKind: "promo_extra_revision", earningsCents: 1500, salesCount: 3 },
      ],
      "USD",
    );
    assert.equal(rollup.rows.length, 1);
    assert.equal(rollup.rows[0].source, "promo_video");
    assert.equal(rollup.rows[0].label, "Promo videos");
    assert.equal(rollup.rows[0].earningsCents, 10500);
    assert.equal(rollup.rows[0].salesCount, 5);
    assert.equal(rollup.totalEarnedCents, 10500);
    assert.equal(rollup.totalSales, 5);
    assert.equal(rollup.currency, "USD");
  });

  it("surfaces every distinct revenue source in EARNINGS_SOURCE_ORDER order", () => {
    const rollup = buildEarningsRollup(
      [
        // Deliberately out of display order to prove the sort.
        { sourceKind: "article", earningsCents: 100, salesCount: 1 },
        { sourceKind: "course_enrollment", earningsCents: 200, salesCount: 1 },
        { sourceKind: "voice_clone_license", earningsCents: 300, salesCount: 1 },
        { sourceKind: "promo_project", earningsCents: 400, salesCount: 1 },
      ],
      "USD",
    );
    const sources = rollup.rows.map((r) => r.source);
    assert.deepEqual(sources, ["promo_video", "voice_clone", "course", "article"]);
    // Order matches the canonical display order.
    const ordered = [...sources].sort(
      (a, b) => EARNINGS_SOURCE_ORDER.indexOf(a) - EARNINGS_SOURCE_ORDER.indexOf(b),
    );
    assert.deepEqual(sources, ordered);
  });

  it("routes unknown / null source kinds into 'other' without losing dollars", () => {
    const rollup = buildEarningsRollup(
      [
        { sourceKind: "some_future_kind", earningsCents: 700, salesCount: 1 },
        { sourceKind: null, earningsCents: 300, salesCount: 1 },
      ],
      "USD",
    );
    assert.equal(rollup.rows.length, 1);
    assert.equal(rollup.rows[0].source, "other");
    assert.equal(rollup.rows[0].earningsCents, 1000);
    assert.equal(rollup.rows[0].salesCount, 2);
    assert.equal(rollup.totalEarnedCents, 1000);
  });

  it("drops zero-value aggregates and returns an empty rollup for no accruals", () => {
    const empty = buildEarningsRollup([], "EUR");
    assert.deepEqual(empty.rows, []);
    assert.equal(empty.totalEarnedCents, 0);
    assert.equal(empty.totalSales, 0);
    assert.equal(empty.currency, "EUR");

    const allZero = buildEarningsRollup(
      [{ sourceKind: "template_license", earningsCents: 0, salesCount: 0 }],
      "USD",
    );
    assert.deepEqual(allZero.rows, []);
    assert.equal(allZero.totalEarnedCents, 0);
  });
});
