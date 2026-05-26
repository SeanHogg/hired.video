/**
 * Regression tests for the /5 cron tick rotation + date-window predicates
 * in `scheduled.ts` (gaps #1589, #1593, #1602, #1617).
 *
 * Why this matters: in 2026-05-26 the cron tick was firing all nine
 * sweeps every /5 (#1589) — registered-workers + scrape + heavy sweeps —
 * which routinely tripped `Worker exceeded CPU time limit`. The fix was a
 * tick rotation (`isQuarterTick`, `isHalfTick`) plus daily windows
 * (`isSeedSuperAdminWindow`, etc.). These tests pin the cadence so a
 * future "let's run scrape every tick again" regression fails CI before
 * it ships.
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  isQuarterTick,
  isHalfTick,
  isSeedSuperAdminWindow,
  isRetentionSweepWindow,
  isFraudSweepWindow,
  isMonthlyCloseWindow,
  isPartnerPoolCloseWindow,
} from "../scheduled.js";

function utc(iso: string): Date {
  return new Date(iso);
}

describe("isQuarterTick — /15 cadence registered-workers dispatcher", () => {
  it("fires at :00, :15, :30, :45 (with /5 jitter window)", () => {
    for (const min of [0, 1, 2, 3, 4, 15, 16, 30, 33, 45, 49]) {
      const d = utc(`2026-05-26T12:${String(min).padStart(2, "0")}:00Z`);
      assert.equal(isQuarterTick(d), true, `should fire at :${min}`);
    }
  });

  it("does NOT fire on off-quarter minutes", () => {
    for (const min of [5, 10, 14, 20, 25, 29, 35, 40, 44, 50, 55]) {
      const d = utc(`2026-05-26T12:${String(min).padStart(2, "0")}:00Z`);
      assert.equal(isQuarterTick(d), false, `should NOT fire at :${min}`);
    }
  });
});

describe("isHalfTick — /30 cadence heavy scraper", () => {
  it("fires at :00 and :30 (with /5 jitter window)", () => {
    for (const min of [0, 2, 4, 30, 33]) {
      const d = utc(`2026-05-26T12:${String(min).padStart(2, "0")}:00Z`);
      assert.equal(isHalfTick(d), true, `should fire at :${min}`);
    }
  });

  it("does NOT fire on /15 boundaries that aren't /30", () => {
    for (const min of [15, 18, 45, 49]) {
      const d = utc(`2026-05-26T12:${String(min).padStart(2, "0")}:00Z`);
      assert.equal(isHalfTick(d), false, `should NOT fire at :${min}`);
    }
  });
});

describe("isSeedSuperAdminWindow — daily 03:30 UTC reconciliation (gap #1593)", () => {
  it("fires only in the 03:30–03:34 UTC window", () => {
    for (const min of [30, 31, 32, 33, 34]) {
      const d = utc(`2026-05-26T03:${min}:00Z`);
      assert.equal(isSeedSuperAdminWindow(d), true, `should fire at 03:${min}`);
    }
  });

  it("does NOT fire elsewhere in the day", () => {
    const offTimes = [
      "2026-05-26T03:00:00Z", // earlier in the hour
      "2026-05-26T03:25:00Z",
      "2026-05-26T03:29:59Z",
      "2026-05-26T03:35:00Z", // window closed
      "2026-05-26T03:45:00Z",
      "2026-05-26T04:30:00Z", // wrong hour
      "2026-05-26T15:30:00Z", // afternoon
      "2026-05-26T00:00:00Z",
    ];
    for (const t of offTimes) {
      assert.equal(isSeedSuperAdminWindow(utc(t)), false, `should NOT fire at ${t}`);
    }
  });
});

describe("isRetentionSweepWindow — daily 04:15 UTC retention (gap #1602)", () => {
  it("fires only at 04:15–04:19 UTC", () => {
    for (const min of [15, 16, 17, 18, 19]) {
      const d = utc(`2026-05-26T04:${min}:00Z`);
      assert.equal(isRetentionSweepWindow(d), true);
    }
  });
  it("does NOT collide with the 03:30 seed window or the 04:30 fraud window", () => {
    assert.equal(isRetentionSweepWindow(utc("2026-05-26T03:30:00Z")), false);
    assert.equal(isRetentionSweepWindow(utc("2026-05-26T04:30:00Z")), false);
    assert.equal(isRetentionSweepWindow(utc("2026-05-26T04:14:59Z")), false);
    assert.equal(isRetentionSweepWindow(utc("2026-05-26T04:20:00Z")), false);
  });
});

describe("isFraudSweepWindow — daily 04:30–04:59 UTC (gamification)", () => {
  it("fires for the full half-hour", () => {
    for (const min of [30, 35, 45, 55, 59]) {
      assert.equal(
        isFraudSweepWindow(utc(`2026-05-26T04:${min}:00Z`)),
        true,
        `should fire at 04:${min}`,
      );
    }
  });
  it("does NOT fire at 04:29 or 05:00", () => {
    assert.equal(isFraudSweepWindow(utc("2026-05-26T04:29:00Z")), false);
    assert.equal(isFraudSweepWindow(utc("2026-05-26T05:00:00Z")), false);
  });
});

describe("isMonthlyCloseWindow — 1st of month, 00:00–03:59 UTC", () => {
  it("fires only on the 1st", () => {
    assert.equal(isMonthlyCloseWindow(utc("2026-06-01T01:00:00Z")), true);
    assert.equal(isMonthlyCloseWindow(utc("2026-05-01T03:59:00Z")), true);
  });
  it("does NOT fire on other days even in the morning window", () => {
    assert.equal(isMonthlyCloseWindow(utc("2026-05-26T02:00:00Z")), false);
    assert.equal(isMonthlyCloseWindow(utc("2026-05-02T01:00:00Z")), false);
    // 1st but past 04:00 UTC
    assert.equal(isMonthlyCloseWindow(utc("2026-05-01T04:00:00Z")), false);
  });
});

describe("isPartnerPoolCloseWindow — 1st of month, 02:00–02:04 UTC", () => {
  it("fires inside the 5-minute window on the 1st", () => {
    for (const min of [0, 1, 2, 3, 4]) {
      assert.equal(
        isPartnerPoolCloseWindow(utc(`2026-05-01T02:${String(min).padStart(2, "0")}:00Z`)),
        true,
      );
    }
  });
  it("does NOT fire at 02:05 or after, nor on other days", () => {
    assert.equal(isPartnerPoolCloseWindow(utc("2026-05-01T02:05:00Z")), false);
    assert.equal(isPartnerPoolCloseWindow(utc("2026-05-02T02:00:00Z")), false);
    assert.equal(isPartnerPoolCloseWindow(utc("2026-05-01T03:00:00Z")), false);
  });
});
