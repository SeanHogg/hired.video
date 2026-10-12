/**
 * Tests for resolveSegment — the no-bleed chokepoint. Covers the
 * authorization branches that gate access BEFORE any DB work:
 *   • FORBIDDEN  — an explicit company the user can't access.
 *   • NO_COMPANY — the user belongs to no company.
 * The happy native-create path touches the DB and is covered by the
 * service-level scope-threading tests + integration; the db handle here is
 * a poison stub that throws if reached, proving these guards short-circuit.
 *
 * Run: node --import tsx --test src/services/people-ops/__tests__/segment.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  resolveSegment,
  SegmentResolutionError,
  type ResolveSegmentDeps,
} from "../segment.js";

const poisonDb = new Proxy(
  {},
  {
    get() {
      throw new Error("DB must not be touched before the access guard passes");
    },
  },
) as ResolveSegmentDeps["db"];

function deps(over: Partial<ResolveSegmentDeps>): ResolveSegmentDeps {
  return {
    db: poisonDb,
    getCompanyIdsForUser: async () => ({ companyIds: [], primaryCompanyId: null }),
    canAccessCompany: async () => false,
    now: () => new Date("2026-06-01T00:00:00Z"),
    ...over,
  };
}

describe("resolveSegment — access guards", () => {
  it("throws FORBIDDEN when the explicit company is not in the user's scope", async () => {
    await assert.rejects(
      () => resolveSegment("user-1", "company-x", deps({ canAccessCompany: async () => false })),
      (e) => e instanceof SegmentResolutionError && e.code === "FORBIDDEN",
    );
  });

  it("throws NO_COMPANY when the user belongs to no company", async () => {
    await assert.rejects(
      () =>
        resolveSegment(
          "user-1",
          null,
          deps({ getCompanyIdsForUser: async () => ({ companyIds: [], primaryCompanyId: null }) }),
        ),
      (e) => e instanceof SegmentResolutionError && e.code === "NO_COMPANY",
    );
  });
});
