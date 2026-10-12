/**
 * mapWithConcurrency / settleWithin — the fan-out primitives the résumé
 * parse uses for OCR pages, section backfill and bounded refinement.
 *
 * Run: node --import tsx --test src/utils/__tests__/async.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapWithConcurrency, settleWithin } from "../async.js";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("mapWithConcurrency", () => {
  it("keeps input order even when later items finish first", async () => {
    const out = await mapWithConcurrency([30, 5, 15, 1], 4, async (ms, i) => {
      await delay(ms);
      return i;
    });
    assert.deepEqual(out, [0, 1, 2, 3]);
  });

  it("never exceeds the limit", async () => {
    let inFlight = 0;
    let peak = 0;
    await mapWithConcurrency(Array.from({ length: 10 }, (_, i) => i), 3, async () => {
      peak = Math.max(peak, ++inFlight);
      await delay(2);
      inFlight--;
    });
    assert.equal(peak, 3);
  });

  it("handles an empty list and a limit above the item count", async () => {
    assert.deepEqual(await mapWithConcurrency([], 4, async (x) => x), []);
    assert.deepEqual(await mapWithConcurrency([1, 2], 10, async (x) => x * 2), [2, 4]);
  });

  it("rejects when an item rejects", async () => {
    await assert.rejects(
      mapWithConcurrency([1, 2], 2, async (x) => {
        if (x === 2) throw new Error("boom");
        return x;
      }),
      /boom/,
    );
  });
});

describe("settleWithin", () => {
  it("resolves the value when it lands in time", async () => {
    assert.equal(await settleWithin(Promise.resolve(7), 50), 7);
  });

  it("resolves null when the promise is slower than the budget", async () => {
    assert.equal(await settleWithin(new Promise(() => {}), 10), null);
  });

  it("resolves null when the promise rejects", async () => {
    assert.equal(await settleWithin(Promise.reject(new Error("nope")), 50), null);
  });
});
