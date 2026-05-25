/**
 * Tests for the interview-compare URL builder + parser used by the
 * recruiter multi-select compare flow (#1235). The page treats these as
 * the only authority on what the cap is, so dedupe/cap/min behaviour MUST
 * be pinned.
 */

import { describe, it, expect } from "vitest";
import {
  buildInterviewCompareHref,
  parseCompareIds,
  toggleCompareSelection,
  COMPARE_MIN_IDS,
  COMPARE_MAX_IDS,
} from "../interview-compare-href";

describe("buildInterviewCompareHref", () => {
  it("encodes the ids as a comma-separated query param", () => {
    expect(buildInterviewCompareHref(["a", "b", "c"])).toBe(
      "/interview-assignments/compare?ids=a%2Cb%2Cc",
    );
  });

  it("dedupes repeated ids (same row checked twice)", () => {
    expect(buildInterviewCompareHref(["a", "a", "b"])).toBe(
      "/interview-assignments/compare?ids=a%2Cb",
    );
  });

  it("trims whitespace", () => {
    expect(buildInterviewCompareHref([" a ", "b\n"])).toBe(
      "/interview-assignments/compare?ids=a%2Cb",
    );
  });

  it("caps at COMPARE_MAX_IDS (silently drops extras)", () => {
    const ids = Array.from({ length: 9 }, (_, i) => `id${i}`);
    const url = buildInterviewCompareHref(ids);
    // 9 → 6, comma-encoded
    const expected = ids.slice(0, COMPARE_MAX_IDS).join(",");
    expect(url).toBe(`/interview-assignments/compare?ids=${encodeURIComponent(expected)}`);
  });
});

describe("parseCompareIds", () => {
  it("returns [] when raw is missing or empty", () => {
    expect(parseCompareIds(null)).toEqual([]);
    expect(parseCompareIds(undefined)).toEqual([]);
    expect(parseCompareIds("")).toEqual([]);
  });

  it("returns [] when below COMPARE_MIN_IDS (no useful comparison)", () => {
    expect(parseCompareIds("only-one")).toEqual([]);
  });

  it("returns the normalised list at exactly the min", () => {
    expect(parseCompareIds("a,b")).toEqual(["a", "b"]);
  });

  it("dedupes + trims like the builder", () => {
    expect(parseCompareIds(" a , b , a ")).toEqual(["a", "b"]);
  });

  it("caps at COMPARE_MAX_IDS", () => {
    const ids = Array.from({ length: 9 }, (_, i) => `id${i}`);
    expect(parseCompareIds(ids.join(","))).toEqual(ids.slice(0, COMPARE_MAX_IDS));
  });
});

describe("toggleCompareSelection", () => {
  it("adds an unselected id", () => {
    expect(toggleCompareSelection(["a"], "b")).toEqual(["a", "b"]);
  });

  it("removes an already-selected id", () => {
    expect(toggleCompareSelection(["a", "b"], "a")).toEqual(["b"]);
  });

  it("does NOT add past the cap (returns a copy unchanged so caller can show a toast)", () => {
    const at = Array.from({ length: COMPARE_MAX_IDS }, (_, i) => `id${i}`);
    const next = toggleCompareSelection(at, "extra");
    // Same content; new reference (helper never mutates input).
    expect(next).toEqual(at);
    expect(next).not.toBe(at);
  });

  it("uses a generous min so toggling below the min stays valid (page renders empty state)", () => {
    // toggling does not enforce min — only buildInterviewCompareHref consumers do.
    expect(toggleCompareSelection(["a"], "a")).toEqual([]);
    expect(COMPARE_MIN_IDS).toBe(2);
  });
});
