/**
 * Tests for the shared resume-date utility.
 *
 * Regression context: ResumeTimelines.tsx, types/people.ts, and
 * ResumeBuilder.tsx all parsed resume dates with `new Date(s)`. That
 * silently returned Invalid Date for the most common format we produce
 * ("MM/YYYY"), so the Career Timeline rendered education entries with no
 * dates and `getExperienceLevel` always returned "Entry Level". These
 * tests pin the format support so future changes don't regress.
 *
 * Run: vitest run lib/utils/__tests__/resume-date.test.ts
 */

import { describe, it, expect } from "vitest";
import {
  calculateResumeDuration,
  compareByEndThenStartDesc,
  formatResumeDate,
  formatResumeDateRange,
  hasDisplayableDateRange,
  isPresent,
  parseResumeDate,
} from "@/lib/utils/resume-date";

describe("isPresent", () => {
  it("treats empty / null / 'present' / 'current' / 'now' as present", () => {
    expect(isPresent("")).toBe(true);
    expect(isPresent("   ")).toBe(true);
    expect(isPresent(null)).toBe(true);
    expect(isPresent(undefined)).toBe(true);
    expect(isPresent("Present")).toBe(true);
    expect(isPresent("PRESENT")).toBe(true);
    expect(isPresent("current")).toBe(true);
    expect(isPresent("now")).toBe(true);
  });

  it("treats real dates as not present", () => {
    expect(isPresent("01/2020")).toBe(false);
    expect(isPresent("2020-01")).toBe(false);
    expect(isPresent("2020")).toBe(false);
  });
});

describe("parseResumeDate", () => {
  it("parses MM/YYYY (the regex parser's main output)", () => {
    const d = parseResumeDate("01/1999");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(1999);
    expect(d!.getMonth()).toBe(0); // January
  });

  it("parses M/YYYY (single-digit month)", () => {
    const d = parseResumeDate("9/2022");
    expect(d!.getFullYear()).toBe(2022);
    expect(d!.getMonth()).toBe(8); // September
  });

  it("parses ISO yyyy-mm", () => {
    const d = parseResumeDate("2020-09");
    expect(d!.getFullYear()).toBe(2020);
    expect(d!.getMonth()).toBe(8);
  });

  it("parses ISO yyyy-mm-dd", () => {
    const d = parseResumeDate("2020-09-15");
    expect(d!.getFullYear()).toBe(2020);
    expect(d!.getMonth()).toBe(8);
    expect(d!.getDate()).toBe(15);
  });

  it("parses MM/DD/YYYY", () => {
    const d = parseResumeDate("09/15/2020");
    expect(d!.getFullYear()).toBe(2020);
    expect(d!.getMonth()).toBe(8);
    expect(d!.getDate()).toBe(15);
  });

  it("parses year-only", () => {
    const d = parseResumeDate("2020");
    expect(d!.getFullYear()).toBe(2020);
  });

  it("returns null for empty / Present", () => {
    expect(parseResumeDate("")).toBeNull();
    expect(parseResumeDate("Present")).toBeNull();
    expect(parseResumeDate(null)).toBeNull();
  });

  it("returns null for total garbage", () => {
    expect(parseResumeDate("not a date")).toBeNull();
  });
});

describe("formatResumeDate", () => {
  it("formats MM/YYYY", () => {
    expect(formatResumeDate("01/1999")).toBe("Jan 1999");
    expect(formatResumeDate("12/2004")).toBe("Dec 2004");
  });

  it("formats year-only", () => {
    expect(formatResumeDate("2020")).toBe("Jan 2020");
  });

  it("returns 'Present' for empty / Present", () => {
    expect(formatResumeDate("")).toBe("Present");
    expect(formatResumeDate("Present")).toBe("Present");
    expect(formatResumeDate(null)).toBe("Present");
  });

  it("respects custom presentLabel", () => {
    expect(formatResumeDate("", "Now")).toBe("Now");
  });
});

describe("hasDisplayableDateRange", () => {
  it("returns true when both ends are real dates", () => {
    expect(hasDisplayableDateRange("01/1999", "12/2004")).toBe(true);
  });

  it("returns true when only start is known", () => {
    expect(hasDisplayableDateRange("01/2020", "")).toBe(true);
    expect(hasDisplayableDateRange("01/2020", "Present")).toBe(true);
  });

  it("returns true when only end is known", () => {
    expect(hasDisplayableDateRange("", "12/2020")).toBe(true);
  });

  it("returns false when both empty / Present", () => {
    expect(hasDisplayableDateRange("", "")).toBe(false);
    expect(hasDisplayableDateRange("Present", "Present")).toBe(false);
    expect(hasDisplayableDateRange(undefined, undefined)).toBe(false);
  });
});

describe("formatResumeDateRange", () => {
  it("formats MM/YYYY range — the bug regression case", () => {
    // This is the exact case the user reported: education with MM/YYYY
    // dates wasn't rendering anything.
    expect(formatResumeDateRange("01/1999", "12/2004")).toBe("Jan 1999 - Dec 2004");
  });

  it("renders Present for missing endDate", () => {
    expect(formatResumeDateRange("10/2022", "")).toBe("Oct 2022 - Present");
    expect(formatResumeDateRange("10/2022", "Present")).toBe("Oct 2022 - Present");
  });

  it("renders only end when start is missing", () => {
    expect(formatResumeDateRange("", "12/2020")).toBe("Dec 2020");
  });

  it("renders empty when no dates", () => {
    expect(formatResumeDateRange("", "")).toBe("");
  });
});

describe("calculateResumeDuration", () => {
  it("computes duration with MM/YYYY dates", () => {
    expect(calculateResumeDuration("01/2020", "01/2023")).toBe("3y");
    expect(calculateResumeDuration("01/2020", "07/2020")).toBe("6m");
    expect(calculateResumeDuration("01/2020", "07/2022")).toBe("2y 6m");
  });

  it("treats empty / Present endDate as today", () => {
    const result = calculateResumeDuration("01/2020", "");
    expect(result).not.toBe(""); // should produce some duration
    expect(result).toMatch(/\d+y/); // multiple years from 2020 to now
  });

  it("returns empty when start is missing", () => {
    expect(calculateResumeDuration("", "01/2023")).toBe("");
  });
});

describe("compareByEndThenStartDesc", () => {
  it("places current positions first", () => {
    const items = [
      { startDate: "01/2018", endDate: "12/2020" }, // ended
      { startDate: "01/2022", endDate: "" }, // current
    ];
    items.sort(compareByEndThenStartDesc);
    expect(items[0].endDate).toBe(""); // current first
  });

  it("sorts ended positions by end date descending", () => {
    const items = [
      { startDate: "01/2010", endDate: "12/2015" },
      { startDate: "01/2018", endDate: "12/2020" },
      { startDate: "01/2005", endDate: "12/2008" },
    ];
    items.sort(compareByEndThenStartDesc);
    expect(items.map((i) => i.endDate)).toEqual(["12/2020", "12/2015", "12/2008"]);
  });

  it("sorts current positions by start date descending", () => {
    const items = [
      { startDate: "01/2018", endDate: "" },
      { startDate: "01/2022", endDate: "Present" },
    ];
    items.sort(compareByEndThenStartDesc);
    expect(items[0].startDate).toBe("01/2022");
  });
});
