/**
 * linkedInApiVersion — the LinkedIn-Version header follows the calendar so
 * it never names a retired version (426 NONEXISTENT_VERSION, 2026-10-13).
 *
 * Run: node --import tsx --test src/utils/__tests__/linkedin-version.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { linkedInApiVersion } from "../linkedin-version.js";

const OCT_13_2026 = new Date("2026-10-13T04:42:29.456Z");

describe("linkedInApiVersion", () => {
  it("is two months back from today (the day 202509 was refused)", () => {
    assert.equal(linkedInApiVersion(OCT_13_2026, undefined), "202608");
  });

  it("rolls across a year boundary", () => {
    assert.equal(linkedInApiVersion(new Date("2027-01-02T00:00:00Z"), undefined), "202611");
    assert.equal(linkedInApiVersion(new Date("2027-02-28T23:59:59Z"), undefined), "202612");
  });

  it("honours an override inside the active window", () => {
    assert.equal(linkedInApiVersion(OCT_13_2026, "202603"), "202603");
  });

  it("ignores a retired override (the stale 202404 / 202509 pins) — boundary", () => {
    assert.equal(linkedInApiVersion(OCT_13_2026, "202404"), "202608");
    assert.equal(linkedInApiVersion(OCT_13_2026, "202511"), "202608");
    assert.equal(linkedInApiVersion(OCT_13_2026, "202512"), "202512");
  });

  it("ignores a future or malformed override (exception path)", () => {
    assert.equal(linkedInApiVersion(OCT_13_2026, "202701"), "202608");
    assert.equal(linkedInApiVersion(OCT_13_2026, "20250901"), "202608");
    assert.equal(linkedInApiVersion(OCT_13_2026, "latest"), "202608");
  });
});
