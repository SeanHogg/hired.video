/**
 * SuperAdmin AI-vendor observability — /schema-retries response shaping
 * (gap #2159).
 *
 * The route is a thin `usage_ledger` JSONB group-by read piped through the
 * pure `shapeSchemaRetries` helper. The fake-db AST harness can't model the
 * `metadata->>'schemaRetries'` extraction + `sum(... ::int)` group-by the
 * production SQL uses (those raw `sql` predicates fall through to match-all),
 * so the real coverage lives on the shaper: it must coerce the wire-driver's
 * stringy `::int` / `sum` counts to numbers, preserve per-feature ordering,
 * roll up the grand total, and tolerate null feature keys.
 *
 * Run: node --import tsx --test src/routes/superadmin/__tests__/ai-vendors.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { shapeSchemaRetries } from "../ai-vendors.js";

describe("shapeSchemaRetries (#2159)", () => {
  it("coerces stringy ::int / sum counts to numbers and rolls up the total", () => {
    // Neon's HTTP driver returns aggregate casts as strings on the wire.
    const { totalRetries, byFeature } = shapeSchemaRetries([
      { featureKey: "career_360_plan", totalRetries: "12", calls: "4", lastSeen: "2026-06-28T00:00:00.000Z" },
      { featureKey: "match_insights", totalRetries: "3", calls: "2", lastSeen: "2026-06-27T00:00:00.000Z" },
    ]);

    assert.equal(totalRetries, 15);
    assert.equal(byFeature.length, 2);
    assert.deepEqual(
      byFeature.map((r) => ({ k: r.featureKey, t: r.totalRetries, c: r.calls })),
      [
        { k: "career_360_plan", t: 12, c: 4 },
        { k: "match_insights", t: 3, c: 2 },
      ],
    );
    // Numbers, not strings — guards the SA widget's tabular-nums render.
    for (const r of byFeature) {
      assert.equal(typeof r.totalRetries, "number");
      assert.equal(typeof r.calls, "number");
    }
  });

  it("preserves the DB's totalRetries-desc ordering verbatim", () => {
    const { byFeature } = shapeSchemaRetries([
      { featureKey: "a", totalRetries: 9, calls: 3, lastSeen: null },
      { featureKey: "b", totalRetries: 5, calls: 5, lastSeen: null },
      { featureKey: "c", totalRetries: 1, calls: 1, lastSeen: null },
    ]);
    assert.deepEqual(byFeature.map((r) => r.featureKey), ["a", "b", "c"]);
  });

  it("treats null/absent counts as zero and tolerates a null feature key", () => {
    const { totalRetries, byFeature } = shapeSchemaRetries([
      { featureKey: null, totalRetries: null, calls: null, lastSeen: null },
    ]);
    assert.equal(totalRetries, 0);
    assert.equal(byFeature[0].featureKey, null);
    assert.equal(byFeature[0].totalRetries, 0);
    assert.equal(byFeature[0].calls, 0);
  });

  it("returns an empty, zero-total shape for no rows (the widget empty state)", () => {
    const { totalRetries, byFeature } = shapeSchemaRetries([]);
    assert.equal(totalRetries, 0);
    assert.deepEqual(byFeature, []);
  });
});
