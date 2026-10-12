/**
 * Slot → placementType mapping for GET /api/advertising/serve.
 * Run: node --import tsx --test src/services/advertising/__tests__/slot-placements.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { placementsForSlot } from "../slot-placements.js";

describe("placementsForSlot", () => {
  it("maps dashboard-banner to search_top and both", () => {
    assert.deepEqual(placementsForSlot("dashboard-banner"), ["search_top", "both"]);
  });

  it("maps jobs-sidebar to discovery_feed and both", () => {
    assert.deepEqual(placementsForSlot("jobs-sidebar"), ["discovery_feed", "both"]);
  });

  it("falls back to all in-feed placements for unknown slots", () => {
    assert.deepEqual(placementsForSlot("unknown-slot"), ["search_top", "discovery_feed", "both"]);
  });
});
