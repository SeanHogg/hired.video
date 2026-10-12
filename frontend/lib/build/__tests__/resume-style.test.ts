/**
 * The résumé's look over its template (font, size, spacing, colour, page):
 * parsed defensively from a stored row, laid over the descriptor every
 * surface renders with, stored with the design, and carried to the print
 * page's @page size.
 */
import { describe, expect, it } from "vitest";
import { ResumeContentSchema, type ResumeContent } from "@shared/resume";
import { DEFAULT_DESCRIPTOR, validateDescriptor } from "@/types/resume-template";
import {
  applyResumeStyle,
  isEmptyStyle,
  parseResumeStyle,
  resumePaper,
  resumePrintPageSize,
  resumeStyleKey,
  RESUME_SIZE_SCALE,
} from "../resume-style";
import { designKey, resolveResumeDescriptor, savedStyle, withDesign } from "@/lib/resume-design";

const content: ResumeContent = ResumeContentSchema.parse({ basics: { name: "Sean Hogg" } });

describe("parseResumeStyle", () => {
  it("keeps valid fields and drops anything else", () => {
    expect(parseResumeStyle({ font: "serif", size: "large", spacing: "compact", colour: "executive-navy", paper: "a4" })).toEqual({
      font: "serif",
      size: "large",
      spacing: "compact",
      colour: "executive-navy",
      paper: "a4",
    });
    expect(parseResumeStyle({ font: "comic", paper: "legal", size: 12 })).toEqual({});
    expect(parseResumeStyle(null)).toEqual({});
    expect(parseResumeStyle("serif")).toEqual({});
  });
});

describe("applyResumeStyle", () => {
  it("an empty style is the template itself", () => {
    expect(applyResumeStyle(DEFAULT_DESCRIPTOR, {})).toBe(DEFAULT_DESCRIPTOR);
    expect(applyResumeStyle(DEFAULT_DESCRIPTOR, undefined)).toBe(DEFAULT_DESCRIPTOR);
  });

  it("lays font, spacing, colour, size and page over the template", () => {
    const d = applyResumeStyle(DEFAULT_DESCRIPTOR, { font: "mono", spacing: "spacious", colour: "warm-amber", size: "small", paper: "a4" });
    expect(d.theme).toMatchObject({ fontFamily: "mono", density: "spacious", themeKey: "warm-amber", fontScale: RESUME_SIZE_SCALE.small });
    expect(d.paper).toBe("a4");
    expect(d.sections).toBe(DEFAULT_DESCRIPTOR.sections);
    // Still a valid descriptor (the print URL carries it).
    expect(validateDescriptor(JSON.parse(JSON.stringify(d))).ok).toBe(true);
  });

  it("medium text keeps the template's scale", () => {
    expect(applyResumeStyle(DEFAULT_DESCRIPTOR, { size: "medium", font: "serif" }).theme.fontScale).toBeUndefined();
  });
});

describe("paper", () => {
  it("is Letter unless the descriptor says A4", () => {
    expect(resumePaper(DEFAULT_DESCRIPTOR)).toBe("letter");
    expect(resumePaper({ paper: "a4" })).toBe("a4");
    expect(resumePrintPageSize({ paper: "a4" })).toBe("210mm 297mm");
    expect(resumePrintPageSize({})).toBe("8.5in 11in");
  });

  it("validateDescriptor refuses an unknown paper and an extreme scale", () => {
    expect(validateDescriptor({ ...DEFAULT_DESCRIPTOR, paper: "legal" }).ok).toBe(false);
    expect(validateDescriptor({ ...DEFAULT_DESCRIPTOR, theme: { ...DEFAULT_DESCRIPTOR.theme, fontScale: 3 } }).ok).toBe(false);
  });
});

describe("the style as part of the design", () => {
  const design = { templateId: DEFAULT_DESCRIPTOR.id, structure: null, style: { paper: "a4" as const, colour: "executive-navy" as const } };

  it("is stored on content.meta.style and read back", () => {
    const stored = withDesign(content, design);
    expect((stored.meta as Record<string, unknown>).style).toEqual({ paper: "a4", colour: "executive-navy" });
    expect(savedStyle(stored)).toEqual(design.style);
    expect(resolveResumeDescriptor(stored).paper).toBe("a4");
    expect(resolveResumeDescriptor(stored).theme.themeKey).toBe("executive-navy");
  });

  it("an empty style removes a stored one", () => {
    const stored = withDesign(withDesign(content, design), { ...design, style: {} });
    expect((stored.meta as Record<string, unknown>).style).toBeUndefined();
    expect(isEmptyStyle(savedStyle(stored))).toBe(true);
  });

  it("a style change is a design change (autosave sees it)", () => {
    expect(designKey(design)).not.toBe(designKey({ ...design, style: { paper: "letter" } }));
    expect(resumeStyleKey({ font: "serif" })).toBe(resumeStyleKey({ font: "serif", size: undefined }));
  });
});
