/**
 * Safari version + ctx.filter feature-detect (#2393).
 *
 * Run: vitest run lib/studio/__tests__/canvas-filter-support.test.ts
 */
import { describe, expect, it } from "vitest";
import {
  safariLacksCanvasFilter,
  safariMajorVersion,
  supportsCanvasFilter,
} from "@/lib/studio/canvas-filter-support";

const SAFARI_17 =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
const SAFARI_18 =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const IOS_SAFARI_17 =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const CRIOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1";
const FIREFOX =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0";

describe("safariMajorVersion", () => {
  it("reads Version/N from desktop and iOS Safari", () => {
    expect(safariMajorVersion(SAFARI_17)).toBe(17);
    expect(safariMajorVersion(SAFARI_18)).toBe(18);
    expect(safariMajorVersion(IOS_SAFARI_17)).toBe(17);
  });

  it("returns null for Chrome / CriOS / Firefox (they contain 'Safari')", () => {
    expect(safariMajorVersion(CHROME)).toBeNull();
    expect(safariMajorVersion(CRIOS)).toBeNull();
    expect(safariMajorVersion(FIREFOX)).toBeNull();
    expect(safariMajorVersion("")).toBeNull();
  });
});

describe("safariLacksCanvasFilter", () => {
  it("is true only for Safari before 18", () => {
    expect(safariLacksCanvasFilter(SAFARI_17)).toBe(true);
    expect(safariLacksCanvasFilter(IOS_SAFARI_17)).toBe(true);
    expect(safariLacksCanvasFilter(SAFARI_18)).toBe(false);
    expect(safariLacksCanvasFilter(CHROME)).toBe(false);
  });
});

describe("supportsCanvasFilter", () => {
  it("is a plain `in` check, not a UA sniff", () => {
    expect(supportsCanvasFilter({ filter: "none" })).toBe(true);
    expect(supportsCanvasFilter({})).toBe(false);
  });
});
