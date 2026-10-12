/**
 * DocumentView date-fidelity tests (#2152 richer item render). The read/export
 * renderer humanizes resume dates and renders the section's `dateRange` pair as
 * a single formatted range — so "2019-03"/"2022-05" shows as "Mar 2019 – May
 * 2022", not two raw ISO meta tokens.
 *
 * Run: vitest run components/studio/document/__tests__/document-view-fidelity.test.ts
 */
import { describe, it, expect } from "vitest";
import { formatDocDate, formatDateRange } from "@/lib/studio/document/document-dates";
import { resolveDocumentTheme } from "@/lib/studio/editor-v2/document-theme";
import { sectionCardStyle } from "../DocumentSectionViews";

describe("formatDocDate", () => {
  it("humanizes month- and day-precision ISO dates", () => {
    expect(formatDocDate("2019-03")).toBe("Mar 2019");
    expect(formatDocDate("2022-12-21")).toBe("Dec 2022");
  });
  it("passes through blanks and free text", () => {
    expect(formatDocDate("")).toBe("");
    expect(formatDocDate(undefined)).toBe("");
    expect(formatDocDate("Summer 2020")).toBe("Summer 2020");
  });
  it("ignores an out-of-range month rather than producing garbage", () => {
    expect(formatDocDate("2019-13")).toBe("2019-13");
  });
});

describe("formatDateRange", () => {
  it("formats a full range", () => {
    expect(formatDateRange("2019-03", "2022-05")).toBe("Mar 2019 – May 2022");
  });
  it("uses 'Present' for an open end", () => {
    expect(formatDateRange("2019-03", "")).toBe("Mar 2019 – Present");
  });
  it("returns the lone end when no start, and empty when neither", () => {
    expect(formatDateRange("", "2022-05")).toBe("May 2022");
    expect(formatDateRange("", "")).toBe("");
  });
});

describe("sectionCardStyle (#2152(1) card chrome)", () => {
  const theme = resolveDocumentTheme({ themeKey: "balanced-blue", fontFamily: "sans", headingStyle: "underlined", density: "comfortable" });
  it("draws each card style from the document palette", () => {
    expect(sectionCardStyle("bordered", theme)).toMatchObject({ border: `2px solid ${theme.accentBorder}` });
    expect(sectionCardStyle("elevated", theme).boxShadow).toBeDefined();
    expect(sectionCardStyle("flat", theme).background).toBe(`${theme.muted}14`);
  });
  it("ghost and no style mean no card", () => {
    expect(sectionCardStyle("ghost", theme)).toEqual({});
    expect(sectionCardStyle(undefined, theme)).toEqual({});
  });
});
