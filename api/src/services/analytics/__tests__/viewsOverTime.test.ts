/**
 * #861 — the views-over-time series behind the résumé MetricsPanel adapter.
 * Rows mirror the grouped SQL in buildArtifactMetrics:
 *   { day: 'YYYY-MM-DD', views: count }.
 *
 * Run: node --import tsx --test src/services/analytics/__tests__/viewsOverTime.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fillDailySeries, VIEWS_OVER_TIME_DAYS } from "../artifactAnalytics.js";

const NOW = new Date("2026-10-10T18:45:00.000Z");

describe("fillDailySeries", () => {
  it("zero-fills a 30-day window ending today (UTC), oldest first", () => {
    const series = fillDailySeries([{ day: "2026-10-10", views: 4 }, { day: "2026-10-01", views: 2 }], NOW);
    assert.equal(series.length, VIEWS_OVER_TIME_DAYS);
    assert.equal(series[0]!.date, "2026-09-11");
    assert.deepEqual(series.at(-1), { date: "2026-10-10", views: 4 });
    assert.equal(series.find((p) => p.date === "2026-10-01")!.views, 2);
    assert.equal(series.reduce((a, p) => a + p.views, 0), 6);
  });

  it("boundary: rows outside the window are ignored; count strings coerce", () => {
    const series = fillDailySeries([{ day: "2026-09-10", views: 9 }, { day: "2026-10-09", views: "3" as unknown as number }], NOW);
    assert.equal(series.reduce((a, p) => a + p.views, 0), 3);
  });

  it("no views → an all-zero series (never empty)", () => {
    const series = fillDailySeries([], NOW, 7);
    assert.equal(series.length, 7);
    assert.ok(series.every((p) => p.views === 0));
  });
});
