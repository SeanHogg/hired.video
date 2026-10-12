/** The one studio-template → create-input core: a video template starts from
 *  its script, a job/article document template from its layout, and a résumé
 *  template (a studio template with documentKind 'resume') opens the career
 *  kit wearing it. Fixtures mirror real `studio_templates` rows. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const getBySlugOrId = vi.fn();
vi.mock("@/lib/services/studio-templates-service", () => ({
  studioTemplatesService: { getBySlugOrId: (ref: string) => getBySlugOrId(ref) },
}));

import { loadStudioTemplateStart, studioTemplateStart } from "../studio-template-start";

const script = { title: "Pitch", scenes: [{ kind: "scene", text: "Hello" }] };

/** A published video template row (the shape GET /templates/listing returns). */
const videoRow = {
  id: "0d8e1c55-2f6a-4b1e-8c3d-6a7b9e0f1a2b",
  listingSlug: "launch-reel-a1b2c3d4",
  name: "Launch reel",
  mediaKind: "video" as const,
  documentKind: null,
  videoScript: script,
};

/** A résumé template folded in from `resume_templates` (mig 0520): document
 *  media kind, document kind résumé, content-stripped DocumentState payload. */
const resumeRow = {
  id: "6f1c2a9e-0b7d-4e7a-9a51-3c2d1e0f9a88",
  listingSlug: "clinical-blue-two-column-3fa9c1d2",
  name: "Clinical Blue, two column",
  mediaKind: "document" as const,
  documentKind: "resume" as const,
  videoScript: {
    entityKind: "resume",
    entityId: null,
    templateId: "healthcare-clinical-blue",
    pageSize: "letter",
    orientation: "portrait",
    columns: 12,
    theme: { key: "clinical-blue" },
    pages: [{ id: "p1", blocks: [{ id: "b1", kind: "section", key: "work" }], overlays: [] }],
  },
};

const jobRow = {
  id: "9a7b6c5d-4e3f-4a1b-9c8d-7e6f5a4b3c2d",
  listingSlug: null,
  name: "Engineering job post",
  mediaKind: "document" as const,
  documentKind: "job" as const,
  videoScript: { entityKind: "job", entityId: "should-be-cleared", pages: [{ id: "p1", blocks: [], overlays: [] }] },
};

beforeEach(() => {
  getBySlugOrId.mockReset();
});

describe("studioTemplateStart", () => {
  it("builds the script create input named after a video template", () => {
    expect(studioTemplateStart(videoRow)).toEqual({ kind: "script", script, name: "Launch reel" });
  });

  it("sends a résumé template to the career kit, by listing slug", () => {
    expect(studioTemplateStart(resumeRow)).toEqual({ kind: "resumeTemplate", design: "clinical-blue-two-column-3fa9c1d2" });
  });

  it("falls back to the id for an unlisted résumé template", () => {
    expect(studioTemplateStart({ ...resumeRow, listingSlug: null })).toEqual({
      kind: "resumeTemplate",
      design: resumeRow.id,
    });
  });

  it("seeds a non-résumé document from its layout, bound to no entity", () => {
    const start = studioTemplateStart(jobRow);
    expect(start?.kind).toBe("document");
    if (start?.kind !== "document") return;
    expect(start.name).toBe("Engineering job post");
    expect(start.documentState.entityKind).toBe("job");
    expect(start.documentState.entityId).toBeNull();
  });

  it("is null when the template carries no payload", () => {
    expect(studioTemplateStart({ ...videoRow, videoScript: null })).toBeNull();
    expect(studioTemplateStart({ ...resumeRow, videoScript: undefined })).toBeNull();
  });
});

describe("loadStudioTemplateStart", () => {
  it("fetches the template by its listing slug (or id)", async () => {
    getBySlugOrId.mockResolvedValue(videoRow);
    await expect(loadStudioTemplateStart("launch-reel-a1b2c3d4")).resolves.toEqual({
      kind: "script",
      script,
      name: "Launch reel",
    });
    expect(getBySlugOrId).toHaveBeenCalledWith("launch-reel-a1b2c3d4");
  });

  it("resolves a résumé template to the kit start", async () => {
    getBySlugOrId.mockResolvedValue(resumeRow);
    await expect(loadStudioTemplateStart(resumeRow.id)).resolves.toEqual({
      kind: "resumeTemplate",
      design: "clinical-blue-two-column-3fa9c1d2",
    });
  });

  it("resolves null for a template without a payload", async () => {
    getBySlugOrId.mockResolvedValue({ ...videoRow, videoScript: null });
    await expect(loadStudioTemplateStart("empty")).resolves.toBeNull();
  });

  it("rejects when the fetch fails (callers toast their own error)", async () => {
    getBySlugOrId.mockRejectedValue(new Error("404"));
    await expect(loadStudioTemplateStart("gone")).rejects.toThrow("404");
  });
});
