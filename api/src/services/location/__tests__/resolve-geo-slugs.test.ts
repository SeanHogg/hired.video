/**
 * resolveGeoSlugs tests (#1833) — the shared canonical geo resolver the
 * /api/locations/resolve route AND the community-resources submit/query paths
 * both use. Verifies the country (iso2) → state (code) → city (slug) chain
 * resolves to ids, and the miss cases report the right `failed` segment.
 *
 * Run: node --import tsx --test src/services/location/__tests__/resolve-geo-slugs.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveGeoSlugs } from "../resolve-geo-slugs.js";

/** Mock drizzle chain — `select().from().where().limit()` resolves to the next
 *  queued result array, in call order. */
function mockDb(queue: unknown[][]) {
  let i = 0;
  const chain: any = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    limit: () => Promise.resolve(queue[i++] ?? []),
  };
  return chain;
}

describe("resolveGeoSlugs", () => {
  it("resolves country → state → city to canonical ids", async () => {
    const db = mockDb([
      [{ id: 1, name: "United States", iso2: "US" }], // country (iso2 branch)
      [{ id: "state-tx", name: "Texas", code: "TX" }], // state
      [{ id: "city-austin", name: "Austin", slug: "austin" }], // city
    ]);
    const r = await resolveGeoSlugs(db, { country: "us", state: "tx", city: "austin" });
    assert.equal(r.failed, null);
    assert.equal(r.reason, null);
    assert.equal(r.geo?.country.id, 1);
    assert.equal(r.geo?.state?.id, "state-tx");
    assert.equal(r.geo?.city?.id, "city-austin");
  });

  it("resolves a country-only request (no state/city)", async () => {
    const db = mockDb([[{ id: 1, name: "United States", iso2: "US" }]]);
    const r = await resolveGeoSlugs(db, { country: "us" });
    assert.equal(r.geo?.country.id, 1);
    assert.equal(r.geo?.state, null);
    assert.equal(r.geo?.city, null);
  });

  it("reports failed='country' when the country is missing or unknown", async () => {
    assert.equal((await resolveGeoSlugs(mockDb([]), { country: "" })).failed, "country");
    // len-2 query empty, then name-fallback query empty → not found.
    const db = mockDb([[], []]);
    const r = await resolveGeoSlugs(db, { country: "zz" });
    assert.equal(r.failed, "country");
    assert.equal(r.geo, null);
  });

  it("reports failed='state' when the state doesn't resolve", async () => {
    const db = mockDb([
      [{ id: 1, name: "United States", iso2: "US" }],
      [], // state miss
    ]);
    const r = await resolveGeoSlugs(db, { country: "us", state: "zz" });
    assert.equal(r.failed, "state");
  });

  it("reports failed='city' with 'city requires state' when a city is given without a state", async () => {
    const db = mockDb([[{ id: 1, name: "United States", iso2: "US" }]]);
    const r = await resolveGeoSlugs(db, { country: "us", city: "austin" });
    assert.equal(r.failed, "city");
    assert.equal(r.reason, "city requires state");
  });
});
