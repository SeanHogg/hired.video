/**
 * Locks the social-proof rounding rule: figures shown on marketing pages
 * must round DOWN (the "N+" claim stays true) and hide below the floor.
 *
 * Run: node --import tsx --test shared/__tests__/marketing-proof.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { PROOF_DISPLAY_FLOOR, roundProofFigure } from "../marketing-proof.js";

describe("roundProofFigure", () => {
  it("hides counts below the display floor", () => {
    assert.equal(roundProofFigure(0), null);
    assert.equal(roundProofFigure(PROOF_DISPLAY_FLOOR - 1), null);
  });

  it("shows the floor itself", () => {
    assert.equal(roundProofFigure(PROOF_DISPLAY_FLOOR), PROOF_DISPLAY_FLOOR);
  });

  it("rounds down to two significant figures, never up", () => {
    assert.equal(roundProofFigure(567), 500);
    assert.equal(roundProofFigure(1_234), 1_200);
    assert.equal(roundProofFigure(1_299), 1_200);
    assert.equal(roundProofFigure(12_345), 12_000);
    assert.equal(roundProofFigure(123_456), 120_000);
    for (const n of [600, 999, 4_321, 98_765, 1_000_001]) {
      const r = roundProofFigure(n);
      assert.ok(r !== null && r <= n, `${n} → ${r} must not exceed the real count`);
    }
  });

  it("rejects non-finite input", () => {
    assert.equal(roundProofFigure(Number.NaN), null);
    assert.equal(roundProofFigure(Number.POSITIVE_INFINITY), null);
  });
});
