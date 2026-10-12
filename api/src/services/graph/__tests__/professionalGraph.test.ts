/**
 * Smoke tests for the professional-graph route module — only the parts
 * that don't need a live DB. The DB-backed traversal logic
 * (findMutualConnections / findShortestPath / rankTopIntroducers) is
 * exercised at the route layer where Drizzle is bound; here we just
 * lock down the public contract (function signatures + names) so a
 * future rename can't silently drop the route handlers.
 *
 * Run: node --import tsx --test src/services/graph/__tests__/professionalGraph.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  findMutualConnections,
  findShortestPath,
  forwardWarmIntro,
  listWarmIntros,
  rankTopIntroducers,
  requestWarmIntro,
} from "../professionalGraph.js";

describe("professionalGraph public API", () => {
  it("exports the three recruiter-graph queries", () => {
    assert.equal(typeof findMutualConnections, "function");
    assert.equal(typeof findShortestPath, "function");
    assert.equal(typeof rankTopIntroducers, "function");
  });

  it("findMutualConnections returns the empty-self case without hitting the DB", async () => {
    const r = await findMutualConnections("u1", "u1");
    assert.equal(r.mutualCount, 0);
    assert.equal(r.mutuals.length, 0);
    assert.equal(r.isDirectConnection, false);
  });

  it("findShortestPath returns degree 'none' for self-query without hitting the DB", async () => {
    const r = await findShortestPath("u1", "u1");
    assert.equal(r.degree, "none");
  });
});

describe("professionalGraph warm-intro public API", () => {
  it("exports the three warm-intro entry points", () => {
    assert.equal(typeof requestWarmIntro, "function");
    assert.equal(typeof listWarmIntros, "function");
    assert.equal(typeof forwardWarmIntro, "function");
  });

  // The self-case branches return before touching the DB — locking
  // these down catches accidental refactors of the precondition guards.
  it("requestWarmIntro rejects when any two of (viewer, via, target) collide", async () => {
    for (const [v, m, t] of [
      ["a", "a", "b"],
      ["a", "b", "a"],
      ["a", "b", "b"],
    ] as const) {
      const r = await requestWarmIntro(v, m, t, "hi");
      assert.ok("error" in r);
      assert.equal((r as { error: string }).error, "self");
    }
  });
});
