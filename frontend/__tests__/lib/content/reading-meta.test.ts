import { describe, expect, it } from "vitest";
import { formatContentDate, joinMeta, wasUpdated, META_SEPARATOR } from "@/lib/content/reading-meta";

describe("formatContentDate", () => {
  it("formats a date-only blog value without shifting the day", () => {
    expect(formatContentDate("2026-03-04", "en-US", "long")).toBe("March 4, 2026");
    expect(formatContentDate("2026-03-04", "en-US", "short")).toBe("Mar 4, 2026");
  });

  it("formats a full timestamp from the articles API", () => {
    // Local-time rendering: any timezone lands within a day of the 18th.
    const out = formatContentDate("2025-11-18T12:00:00.000Z", "en-US", "short");
    expect(out).toMatch(/Nov 1[789], 2025/);
  });

  it("localises month names", () => {
    expect(formatContentDate("2026-03-04", "es", "long")).toContain("marzo");
    expect(formatContentDate("2026-03-04", "fr-CA", "long")).toContain("mars");
  });

  it("returns null for missing or garbage input", () => {
    expect(formatContentDate(null, "en")).toBeNull();
    expect(formatContentDate(undefined, "en")).toBeNull();
    expect(formatContentDate("", "en")).toBeNull();
    expect(formatContentDate("Present", "en")).toBeNull();
  });

  it("falls back to the default locale when given an empty locale", () => {
    expect(formatContentDate("2021-03-01", "", "short")).toBe("Mar 1, 2021");
  });
});

describe("joinMeta", () => {
  it("drops empty segments and joins with the shared separator", () => {
    expect(joinMeta(["Mar 4, 2026", null, "6 min read", undefined, false, "  ", "Resume Tips"])).toBe(
      ["Mar 4, 2026", "6 min read", "Resume Tips"].join(META_SEPARATOR),
    );
  });

  it("keeps numeric segments, including zero", () => {
    expect(joinMeta([0, "views"])).toBe(`0${META_SEPARATOR}views`);
  });

  it("returns an empty string when nothing is left", () => {
    expect(joinMeta([null, undefined, ""])).toBe("");
  });
});

describe("wasUpdated", () => {
  it("is false when either side is missing", () => {
    expect(wasUpdated("2026-01-10", null)).toBe(false);
    expect(wasUpdated(undefined, "2026-01-10")).toBe(false);
  });

  it("compares calendar days, ignoring the time part", () => {
    expect(wasUpdated("2026-01-10", "2026-01-10T18:00:00Z")).toBe(false);
    expect(wasUpdated("2026-01-10", "2026-02-02")).toBe(true);
  });
});
