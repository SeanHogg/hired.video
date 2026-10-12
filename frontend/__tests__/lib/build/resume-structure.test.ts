/**
 * Unit tests for the kit structure transform (chronological / hybrid /
 * functional re-ordering of a resume template descriptor).
 */
import { describe, it, expect } from "vitest";
import { applyResumeStructure } from "@/lib/build/resume-structure";
import {
  DEFAULT_DESCRIPTOR,
  INTERN_EDUCATION_FIRST,
  SALES_GROWTH_EMERALD,
  blockId,
  type ResumeTemplateDescriptor,
} from "@/types/resume-template";

const ids = (d: ResumeTemplateDescriptor) => d.sections.map(blockId);
const pos = (d: ResumeTemplateDescriptor, id: string) => ids(d).indexOf(id);

describe("applyResumeStructure", () => {
  it("chronological puts work before skills and keeps the timeline glued to work", () => {
    const out = applyResumeStructure(INTERN_EDUCATION_FIRST, "chronological");
    expect(pos(out, "work")).toBeLessThan(pos(out, "skills"));
    expect(ids(out)[0]).toBe("work");

    const hero = applyResumeStructure(DEFAULT_DESCRIPTOR, "chronological");
    expect(pos(hero, "career-timeline")).toBe(pos(hero, "work") - 1);
  });

  it("hybrid leads with skills / highlights, then work", () => {
    const out = applyResumeStructure(SALES_GROWTH_EMERALD, "hybrid");
    expect(pos(out, "skills")).toBeLessThan(pos(out, "work"));
    if (pos(out, "projects") !== -1) expect(pos(out, "projects")).toBeLessThan(pos(out, "work"));
  });

  it("hybrid + educationFirst (early-career) puts education first", () => {
    const out = applyResumeStructure(DEFAULT_DESCRIPTOR, "hybrid", { educationFirst: true });
    expect(ids(out)[0]).toBe("education");
    expect(pos(out, "skills")).toBeLessThan(pos(out, "work"));
  });

  it("functional leads with skills and keeps work brief (no highlights)", () => {
    const out = applyResumeStructure(DEFAULT_DESCRIPTOR, "functional");
    expect(ids(out)[0]).toBe("skills");
    const work = out.sections.find((b) => b.kind !== "component" && b.key === "work");
    expect(work && work.kind !== "component" ? work.showHighlights : undefined).toBe(false);
  });

  it("never mutates the preset and keeps every block", () => {
    const before = JSON.stringify(DEFAULT_DESCRIPTOR);
    const out = applyResumeStructure(DEFAULT_DESCRIPTOR, "functional");
    expect(JSON.stringify(DEFAULT_DESCRIPTOR)).toBe(before);
    expect([...ids(out)].sort()).toEqual([...ids(DEFAULT_DESCRIPTOR)].sort());
    expect(out.theme).toBe(DEFAULT_DESCRIPTOR.theme);
  });
});
