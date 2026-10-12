/**
 * Pure helpers behind the unified kit résumé workspace: which sections are
 * editable and how page keys map onto them, zoom stepping, the template row,
 * how a résumé's design is stored + resolved, re-import, and the single
 * "edit this résumé" link.
 */
import { describe, it, expect } from "vitest";
import type { ResumeContent } from "@shared/resume";
import {
  EDITABLE_RESUME_SECTIONS,
  resolveEditableSection,
  sectionItemCount,
  sectionLabelKey,
} from "@/lib/build/editable-sections";
import { ZOOM_STEPS, nextZoom } from "@/lib/build/use-preview-zoom";
import {
  designDescriptor,
  designKey,
  resolveResumeDescriptor,
  savedLayout,
  savedStructure,
  savedTemplateId,
  withDesign,
} from "@/lib/resume-design";
import { mergeReimported } from "@/lib/build/use-resume-reimport";
import { templateChoices } from "@/lib/build/use-resume-insights";
import { resumeDesignPath, resumeEditorPath } from "@/lib/studio/resume-editor-link";
import { createResumeDocumentState, type DocumentState } from "@/lib/studio/editor-v2/document-state";
import { descriptorFromResumeDocument } from "@/lib/studio/document/resume-document-descriptor";
import { DEFAULT_DESCRIPTOR, SALES_GROWTH_EMERALD } from "@/types/resume-template";
import en from "../../../public/locales/en.json";

const content = {
  basics: { name: "Sean Hogg", label: "CTO and Technology Leader" },
  work: [
    { id: "3f2a9c1e-0b7d-4c55-9a1e-6a2f0c8d9e11", name: "Urban Science", position: "Architect" },
    { id: "seed-work-002", name: "Alliance Inspection Management", position: "Chief Innovation Officer" },
  ],
  skills: [],
  meta: { template: DEFAULT_DESCRIPTOR.id, version: "1" },
} as unknown as ResumeContent;

/** A legacy studio page layout, as the old canvas saved it on the row. */
let n = 0;
const LAYOUT: DocumentState = {
  ...createResumeDocumentState("3f2a9c1e-0b7d-4c55-9a1e-6a2f0c8d9e11", ["work", "skills"], () => `blk-${n++}`),
  templateId: SALES_GROWTH_EMERALD.id,
};
const withLayout = (c: ResumeContent) =>
  ({ ...c, meta: { ...(c.meta ?? {}), documentLayout: LAYOUT } }) as ResumeContent;

describe("editable sections", () => {
  it("lists the header first and every section has a translated name", () => {
    expect(EDITABLE_RESUME_SECTIONS[0]).toBe("basics");
    const catalogue = en as Record<string, unknown>;
    for (const key of EDITABLE_RESUME_SECTIONS) {
      expect(typeof catalogue[sectionLabelKey(key)]).toBe("string");
    }
  });

  it("maps page keys onto editable sections", () => {
    expect(resolveEditableSection("work")).toBe("work");
    expect(resolveEditableSection("basics")).toBe("basics");
    // The career timeline component presents the work history.
    expect(resolveEditableSection("career-timeline")).toBe("work");
  });

  it("returns null for blocks without fields and for empty keys", () => {
    expect(resolveEditableSection("hero-video")).toBeNull();
    expect(resolveEditableSection("")).toBeNull();
    expect(resolveEditableSection(undefined)).toBeNull();
  });

  it("counts array items and reports null for the object header", () => {
    expect(sectionItemCount(content, "work")).toBe(2);
    expect(sectionItemCount(content, "skills")).toBe(0);
    expect(sectionItemCount(content, "basics")).toBeNull();
    expect(sectionItemCount(content, "awards")).toBeNull();
  });
});

describe("nextZoom", () => {
  it("steps up and down through the fixed steps", () => {
    expect(nextZoom(1, 1)).toBe(1.1);
    expect(nextZoom(1, -1)).toBe(0.9);
  });
  it("clamps at both ends", () => {
    expect(nextZoom(ZOOM_STEPS[ZOOM_STEPS.length - 1], 1)).toBe(ZOOM_STEPS[ZOOM_STEPS.length - 1]);
    expect(nextZoom(ZOOM_STEPS[0], -1)).toBe(ZOOM_STEPS[0]);
  });
  it("snaps an off-step value to the neighbouring step", () => {
    expect(nextZoom(0.95, 1)).toBe(1.1);
    expect(nextZoom(0.95, -1)).toBe(0.9);
  });
});

describe("templateChoices", () => {
  it("keeps the suggestions when the applied template is among them", () => {
    expect(templateChoices(["a", "b", "c"], "b")).toEqual(["a", "b", "c"]);
  });
  it("puts an applied template that wasn't suggested first, same length", () => {
    expect(templateChoices(["a", "b", "c"], "saved")).toEqual(["saved", "a", "b"]);
  });
  it("handles an empty suggestion list", () => {
    expect(templateChoices([], "saved")).toEqual(["saved"]);
  });
});

describe("résumé design (resume-design.ts)", () => {
  const picked = { templateId: SALES_GROWTH_EMERALD.id, structure: "functional" as const };

  it("withDesign stores template + structure and keeps other meta + content", () => {
    const stored = withDesign(content, picked);
    expect(stored.meta?.template).toBe(SALES_GROWTH_EMERALD.id);
    expect(stored.meta?.structure).toBe("functional");
    expect(stored.meta?.version).toBe("1");
    expect(stored.work).toBe(content.work);
    expect(content.meta?.template).toBe(DEFAULT_DESCRIPTOR.id);
  });

  it("withDesign replaces a legacy studio layout and a stale structure", () => {
    const legacy = withLayout(content);
    const stored = withDesign({ ...legacy, meta: { ...legacy.meta, structure: "hybrid" } } as ResumeContent, {
      templateId: DEFAULT_DESCRIPTOR.id,
      structure: null,
    });
    expect(savedLayout(stored)).toBeNull();
    expect(stored.meta?.structure).toBeUndefined();
  });

  it("savedTemplateId prefers the layout's template and rejects unknown ids", () => {
    expect(savedTemplateId(content)).toBe(DEFAULT_DESCRIPTOR.id);
    expect(savedTemplateId(withLayout(content))).toBe(SALES_GROWTH_EMERALD.id);
    expect(savedTemplateId({ ...content, meta: { template: "no-such-template" } } as ResumeContent)).toBeNull();
    expect(savedTemplateId(null)).toBeNull();
  });

  it("savedStructure only returns known structures", () => {
    expect(savedStructure(withDesign(content, picked))).toBe("functional");
    expect(savedStructure({ ...content, meta: { structure: "zigzag" } } as ResumeContent)).toBeNull();
    expect(savedStructure(content)).toBeNull();
  });

  it("resolveResumeDescriptor: a legacy layout wins, else template + structure", () => {
    expect(resolveResumeDescriptor(withLayout(content))).toEqual(descriptorFromResumeDocument(LAYOUT));
    const designed = withDesign(content, picked);
    expect(resolveResumeDescriptor(designed)).toEqual(designDescriptor(designed, picked));
    // No structure stored → the template's own order (what /resumes/:id always showed).
    expect(resolveResumeDescriptor(content)).toEqual(DEFAULT_DESCRIPTOR);
    expect(resolveResumeDescriptor(null)).toEqual(DEFAULT_DESCRIPTOR);
  });

  it("designKey distinguishes designs and the kept-saved state", () => {
    expect(designKey(null)).toBe("saved");
    expect(designKey(picked)).not.toBe(designKey({ ...picked, structure: null }));
  });
});

describe("re-import", () => {
  it("keeps the résumé's design, media and skill evidence; takes the file's content", () => {
    const current = {
      ...content,
      metaData: [{ id: "m1", itemId: "seed-work-002", url: "https://cdn.hired.video/x.png" }],
      skillEvidence: [{ skillId: "s1", itemId: "seed-work-002" }],
    } as unknown as ResumeContent;
    const parsed = { basics: { name: "Sean Hogg", label: "CTO" }, work: [] } as unknown as ResumeContent;
    const merged = mergeReimported(current, parsed);
    expect(merged.basics).toBe(parsed.basics);
    expect(merged.work).toEqual([]);
    expect(merged.meta).toBe(current.meta);
    expect(merged.metaData).toBe(current.metaData);
    expect(merged.skillEvidence).toBe(current.skillEvidence);
  });
});

describe("resumeEditorPath", () => {
  it("opens the résumé's kit in the workspace", () => {
    expect(resumeEditorPath("3f2a9c1e-0b7d-4c55-9a1e-6a2f0c8d9e11")).toBe(
      "/studio/resume/3f2a9c1e-0b7d-4c55-9a1e-6a2f0c8d9e11",
    );
  });
  it("opens the Design tab", () => {
    expect(resumeDesignPath("seed-resume-1")).toBe("/studio/resume/seed-resume-1?panel=design");
  });
  it("carries the section to open and encodes ids", () => {
    expect(resumeEditorPath("seed resume/1", "work")).toBe("/studio/resume/seed%20resume%2F1?section=work");
  });
});
