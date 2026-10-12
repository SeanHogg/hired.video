import { describe, expect, it } from "vitest";
import { CoverLetterSchema, CoverLetterStyleSchema, readCoverLetter, type CoverLetterStyle } from "@shared/cover-letter";
import type { ResumeContent } from "@shared/resume";
import { DEFAULT_LETTER_STYLE, letterPrintPageSize, letterStyleVars, resolveLetterStyle } from "../letter-style";

const STYLE: CoverLetterStyle = { font: "serif", size: 12, spacing: "relaxed", paper: "a4" };

describe("letterStyleVars", () => {
  it("gives a letter with no style (written before styles) the defaults", () => {
    expect(letterStyleVars()).toEqual(letterStyleVars(DEFAULT_LETTER_STYLE));
    expect(letterStyleVars()).toMatchObject({ fontSize: "11pt", lineHeight: "1.5", pageWidthIn: 8.5, pageHeightIn: 11 });
  });

  it("maps every field of a chosen style", () => {
    const vars = letterStyleVars(STYLE);
    expect(vars.fontFamily).toMatch(/Georgia/);
    expect(vars.fontSize).toBe("12pt");
    expect(vars.lineHeight).toBe("1.75");
    expect(vars.pageWidthIn).toBeCloseTo(8.27, 2);
    expect(vars.pageHeightIn).toBeCloseTo(11.69, 2);
  });

  it("covers every font and spacing the schema allows, each distinct", () => {
    const fonts = CoverLetterStyleSchema.shape.font.options.map((font) => letterStyleVars({ ...STYLE, font }).fontFamily);
    expect(new Set(fonts).size).toBe(fonts.length);
    const spacings = CoverLetterStyleSchema.shape.spacing.options.map((spacing) => Number(letterStyleVars({ ...STYLE, spacing }).lineHeight));
    expect(spacings).toEqual([...spacings].sort((a, b) => a - b));
  });

  it("handles the size bounds (9pt and 14pt)", () => {
    expect(letterStyleVars({ ...STYLE, size: 9 }).fontSize).toBe("9pt");
    expect(letterStyleVars({ ...STYLE, size: 14 }).fontSize).toBe("14pt");
  });
});

describe("letterPrintPageSize / resolveLetterStyle", () => {
  it("prints A4 at exactly 210×297mm and Letter at 8.5×11in", () => {
    expect(letterPrintPageSize(STYLE)).toBe("210mm 297mm");
    expect(letterPrintPageSize({ ...STYLE, paper: "letter" })).toBe("8.5in 11in");
    expect(letterPrintPageSize()).toBe("8.5in 11in");
  });

  it("resolves a missing style to the defaults and keeps a set one", () => {
    expect(resolveLetterStyle()).toEqual(DEFAULT_LETTER_STYLE);
    expect(resolveLetterStyle(STYLE)).toBe(STYLE);
  });
});

describe("CoverLetterStyleSchema", () => {
  const LETTER = { salutation: "Dear Hiring Manager,", opening: ["I am applying."], signOff: "Sincerely,", date: "2026-10-10" };

  it("keeps old letters valid (style optional) and accepts a full style", () => {
    expect(CoverLetterSchema.safeParse(LETTER).success).toBe(true);
    expect(CoverLetterSchema.safeParse({ ...LETTER, style: STYLE }).success).toBe(true);
  });

  it("never loses a stored letter to a bad style (readCoverLetter drops the style)", () => {
    const content = { meta: { coverLetter: { ...LETTER, style: { ...STYLE, size: 40 } } } } as unknown as ResumeContent;
    const letter = readCoverLetter(content);
    expect(letter?.opening).toEqual(["I am applying."]);
    expect(letter?.style).toBeUndefined();
  });

  it("rejects sizes outside 9–14 and unknown values", () => {
    expect(CoverLetterStyleSchema.safeParse({ ...STYLE, size: 8 }).success).toBe(false);
    expect(CoverLetterStyleSchema.safeParse({ ...STYLE, size: 15 }).success).toBe(false);
    expect(CoverLetterStyleSchema.safeParse({ ...STYLE, paper: "legal" }).success).toBe(false);
  });
});
