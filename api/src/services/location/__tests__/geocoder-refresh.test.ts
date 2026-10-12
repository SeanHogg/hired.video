/**
 * Tests for the geocoder cache refresh + eviction sweep (#1161).
 * Run: node --import tsx --test src/services/location/__tests__/geocoder-refresh.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  parseForwardKey,
  runGeocoderRefresh,
  type GeocoderRefreshDeps,
} from "../geocoder-refresh.js";
import type { StaleCacheRow, IGeocoderCacheRepository } from "../../../repositories/geocoderCacheRepository.js";

describe("parseForwardKey", () => {
  it("recovers query + country from a forward key", () => {
    assert.deepEqual(parseForwardKey("fwd:seattle, wa|US"), {
      query: "seattle, wa",
      countryIso2: "US",
    });
  });
  it("handles an empty country bias", () => {
    assert.deepEqual(parseForwardKey("fwd:london|"), { query: "london", countryIso2: undefined });
  });
  it("rejects reverse + malformed keys", () => {
    assert.equal(parseForwardKey("rev:47.6,-122.3"), null);
    assert.equal(parseForwardKey("fwd:|US"), null);
    assert.equal(parseForwardKey("garbage"), null);
  });
});

class FakeRepo implements Partial<IGeocoderCacheRepository> {
  refreshed: { key: string; result: unknown }[] = [];
  evictCalls: { before: Date; maxHits: number; limit: number }[] = [];
  constructor(private readonly stale: StaleCacheRow[]) {}
  async findStalePopular(): Promise<StaleCacheRow[]> {
    return this.stale;
  }
  async refresh(cacheKey: string, result: unknown): Promise<void> {
    this.refreshed.push({ key: cacheKey, result });
  }
  async refreshMany(entries: Array<{ cacheKey: string; result: unknown }>): Promise<void> {
    for (const e of entries) this.refreshed.push({ key: e.cacheKey, result: e.result });
  }
  async deleteStaleLowTraffic(before: Date, maxHits: number, limit: number): Promise<number> {
    this.evictCalls.push({ before, maxHits, limit });
    return 7;
  }
}

const liveGeocoder = {
  isLive: () => true,
  forward: async (q: string) => [{ placeName: `${q} (fresh)` }],
  reverse: async () => null,
} as any;

describe("runGeocoderRefresh", () => {
  it("re-geocodes forward keys and evicts the stale tail", async () => {
    const repo = new FakeRepo([
      { cacheKey: "fwd:seattle|US", result: [{ placeName: "old" }] },
      { cacheKey: "rev:1,2", result: null }, // skipped — not a forward key
    ]);
    const deps: GeocoderRefreshDeps = {
      repo: repo as unknown as IGeocoderCacheRepository,
      rawGeocoder: liveGeocoder,
      now: () => new Date("2026-06-16T00:00:00Z"),
    };
    const res = await runGeocoderRefresh(deps, { staleDays: 90, popularHits: 5 });
    assert.equal(res.skipped, false);
    assert.equal(res.refreshed, 1); // only the fwd: key
    assert.equal(repo.refreshed[0].key, "fwd:seattle|US");
    assert.equal(res.evicted, 7);
    // Eviction targets the low-traffic tail (hit_count <= popularHits).
    assert.equal(repo.evictCalls[0].maxHits, 5);
  });

  it("skips refresh (but still evicts) when no live geocoder", async () => {
    const repo = new FakeRepo([]);
    const deps: GeocoderRefreshDeps = {
      repo: repo as unknown as IGeocoderCacheRepository,
      rawGeocoder: null,
      now: () => new Date("2026-06-16T00:00:00Z"),
    };
    const res = await runGeocoderRefresh(deps);
    assert.equal(res.skipped, true);
    assert.equal(res.refreshed, 0);
    assert.equal(res.evicted, 7);
  });
});
