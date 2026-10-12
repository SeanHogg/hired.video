/**
 * "Use this template" seeding the career kit (`?design=<ref>`): which design
 * a ref names (resolveKitDesign) and how a studio résumé layout lands on the
 * résumé (withDocumentLayout). Fixtures mirror a real résumé row and a
 * résumé studio template as mig 0520 leaves it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResumeContent } from "@shared/resume";

const getBySlugOrId = vi.fn();
vi.mock("@/lib/services/studio-templates-service", () => ({
  studioTemplatesService: { getBySlugOrId: (ref: string) => getBySlugOrId(ref) },
}));

import { resolveKitDesign } from "../use-kit-template";
import { resolveResumeDescriptor, savedLayout, withDocumentLayout } from "@/lib/resume-design";
import type { DocumentState } from "@/lib/studio/editor-v2/document-state";

const layout = {
  entityKind: "resume",
  entityId: null,
  templateId: "healthcare-clinical-blue",
  pageSize: "letter",
  orientation: "portrait",
  columns: 12,
  theme: { key: "clinical-blue" },
  pages: [
    {
      id: "page-1",
      blocks: [
        { id: "b-basics", kind: "section", key: "basics", mode: "flow" },
        { id: "b-work", kind: "section", key: "work", mode: "flow" },
      ],
      overlays: [],
    },
  ],
} as unknown as DocumentState;

const resumeTemplateRow = {
  id: "6f1c2a9e-0b7d-4e7a-9a51-3c2d1e0f9a88",
  listingSlug: "clinical-blue-two-column-3fa9c1d2",
  name: "Clinical Blue, two column",
  mediaKind: "document",
  documentKind: "resume",
  videoScript: layout,
};

/** A saved résumé that already picked a built-in design and a look. */
const content = {
  basics: { name: "Dana Okafor", label: "Registered Nurse", email: "dana@example.com" },
  work: [{ name: "St. Mary's Hospital", position: "RN, ICU", startDate: "2019-04" }],
  education: [{ institution: "University of Toronto", studyType: "BScN", endDate: "2019" }],
  meta: { template: "payroll-iron-gray", structure: "chronological", style: { fontSize: 11 }, coverLetter: { body: "Hello" } },
} as unknown as ResumeContent;

beforeEach(() => {
  getBySlugOrId.mockReset();
});

describe("resolveKitDesign", () => {
  it("names a built-in preset without a fetch", async () => {
    await expect(resolveKitDesign("payroll-iron-gray")).resolves.toEqual({ kind: "preset", templateId: "payroll-iron-gray" });
    expect(getBySlugOrId).not.toHaveBeenCalled();
  });

  it("fetches a résumé studio template through the studio-template API", async () => {
    getBySlugOrId.mockResolvedValue(resumeTemplateRow);
    const design = await resolveKitDesign("clinical-blue-two-column-3fa9c1d2");
    expect(getBySlugOrId).toHaveBeenCalledWith("clinical-blue-two-column-3fa9c1d2");
    expect(design?.kind).toBe("layout");
  });

  it("is null for a non-résumé template or a missing one", async () => {
    getBySlugOrId.mockResolvedValue({ ...resumeTemplateRow, mediaKind: "video", documentKind: null });
    await expect(resolveKitDesign("launch-reel-a1b2c3d4")).resolves.toBeNull();
    getBySlugOrId.mockRejectedValue(new Error("404"));
    await expect(resolveKitDesign("gone")).resolves.toBeNull();
  });
});

describe("withDocumentLayout", () => {
  it("stores the layout as the résumé's own design, replacing the picked one", () => {
    const next = withDocumentLayout(content, layout);
    const meta = next.meta as Record<string, unknown>;
    expect(meta.template).toBeUndefined();
    expect(meta.structure).toBeUndefined();
    expect(meta.style).toBeUndefined();
    expect(meta.coverLetter).toEqual({ body: "Hello" });
    expect(savedLayout(next)?.pages[0]?.blocks.map((b) => b.id)).toEqual(["b-basics", "b-work"]);
    expect(savedLayout(next)?.entityId).toBeNull();
  });

  it("keeps the résumé's content untouched", () => {
    const next = withDocumentLayout(content, layout);
    expect(next.basics).toEqual(content.basics);
    expect(next.work).toEqual(content.work);
  });

  it("renders with the template's base design", () => {
    expect(resolveResumeDescriptor(withDocumentLayout(content, layout)).id).toBe("healthcare-clinical-blue");
  });
});
