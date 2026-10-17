import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import { ROLLUP_EVENTS, rollupArtifactEvents } from "../artifactEventRollup.js";

// Row shapes mirror countStudioEventRows (videoAnalyticsRepository), which
// groups artifact_views by event_type for one studio project and maps the
// stored event types back to studio event names:
//   SELECT event_type, count(*) AS n FROM artifact_views
//   WHERE artifact_id = $1 AND event_type IN ('cta_click','impression')
//   GROUP BY event_type
describe("rollupArtifactEvents", () => {
  it("computes both CTRs for a promoted video with views, clicks and impressions", () => {
    const rows = [
      { event: "impression", n: 12_480 },
      { event: "cta_click", n: 156 },
    ];
    const r = rollupArtifactEvents(rows, 1_950);
    assert.equal(r.ctaClicks, 156);
    assert.equal(r.impressionCount, 12_480);
    assert.equal(r.ctaClickThroughRate, 156 / 1_950);
    assert.equal(r.impressionCtr, 156 / 12_480);
  });

  it("reads 0 impressions and 0 impression CTR when nothing ingests impressions (#1139)", () => {
    const r = rollupArtifactEvents([{ event: "cta_click", n: 7 }], 140);
    assert.equal(r.impressionCount, 0);
    assert.equal(r.impressionCtr, 0);
    assert.equal(r.ctaClickThroughRate, 0.05);
  });

  it("guards divide-by-zero on both denominators", () => {
    const r = rollupArtifactEvents([], 0);
    assert.deepEqual(r, {
      ctaClicks: 0,
      ctaClickThroughRate: 0,
      impressionCount: 0,
      impressionCtr: 0,
    });
  });

  it("handles impressions with no views yet (paid reach before click-through)", () => {
    const r = rollupArtifactEvents([{ event: "impression", n: 3_000 }], 0);
    assert.equal(r.impressionCount, 3_000);
    assert.equal(r.ctaClickThroughRate, 0);
    assert.equal(r.impressionCtr, 0);
  });

  it("coerces string counts (pg bigint) and ignores unrelated / bad rows", () => {
    const r = rollupArtifactEvents(
      [
        { event: "impression", n: "2500" },
        { event: "cta_click", n: "25" },
        { event: "share", n: 99 },
        { event: "view", n: 400 },
        { event: "cta_click", n: null },
        { event: "impression", n: "NaN" },
      ],
      500,
    );
    assert.equal(r.impressionCount, 2_500);
    assert.equal(r.ctaClicks, 25);
    assert.equal(r.impressionCtr, 0.01);
    assert.equal(r.ctaClickThroughRate, 0.05);
  });

  it("queries exactly the events it rolls up", () => {
    assert.deepEqual([...ROLLUP_EVENTS].sort(), ["cta_click", "impression"]);
  });
});
