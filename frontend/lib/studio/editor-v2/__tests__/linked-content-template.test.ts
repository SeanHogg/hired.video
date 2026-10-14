/**
 * Linked-content `template` kind (#827 / #3162) — one kind over
 * studio_templates (video + résumé rows), discriminated in the subtitle.
 *
 * Run: vitest run lib/studio/editor-v2/__tests__/linked-content-template.test.ts
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const listMine = vi.fn();
const getById = vi.fn();
vi.mock("@/lib/services/studio-templates-service", () => ({
  studioTemplatesService: {
    listMine: () => listMine(),
    getById: (id: string) => getById(id),
  },
}));

import {
  isLinkedContentKind,
  parseLinkedContentRef,
  encodeLinkedContentRef,
  LINKED_CONTENT_REGISTRY,
} from "@/lib/studio/editor-v2/linked-content";
import { linkedContentTemplateSubtitle } from "@/lib/studio/editor-v2/linked-content/template";

const STUDIO_ID = "0d8e1c55-2f6a-4b1e-8c3d-6a7b9e0f1a2b";
const RESUME_ID = "6f1c2a9e-0b7d-4e7a-9a51-3c2d1e0f9a88";

const videoRow = {
  id: STUDIO_ID,
  name: "Launch reel",
  description: "A 30s launch cut.",
  mediaKind: "video" as const,
  documentKind: null,
  visibility: "public" as const,
  tags: ["launch"],
};

const resumeRow = {
  id: RESUME_ID,
  name: "Clinical Blue",
  description: "Two-column clinical résumé.",
  mediaKind: "document" as const,
  documentKind: "resume" as const,
  visibility: "unlisted" as const,
  tags: ["healthcare"],
};

beforeEach(() => {
  listMine.mockReset();
  getById.mockReset();
});

describe("linked-content template kind", () => {
  it("registers template as a linked-content kind", () => {
    expect(isLinkedContentKind("template")).toBe(true);
    expect(LINKED_CONTENT_REGISTRY.template.label).toBe("Template");
    expect(LINKED_CONTENT_REGISTRY.template.sectionLabel).toBe("Your templates");
    expect(LINKED_CONTENT_REGISTRY.template.ctaLabel).toBe("View template");
  });

  it("parses template:<id> refs", () => {
    expect(parseLinkedContentRef(`template:${STUDIO_ID}`)).toEqual({
      kind: "template",
      id: STUDIO_ID,
    });
    expect(encodeLinkedContentRef("template", STUDIO_ID)).toBe(`template:${STUDIO_ID}`);
  });

  it("discriminates résumé vs studio in the subtitle", () => {
    expect(linkedContentTemplateSubtitle(videoRow)).toBe("Studio template");
    expect(linkedContentTemplateSubtitle(resumeRow)).toBe("Resume template");
  });

  it("listForUser unions studio_templates rows with the discriminator subtitle", async () => {
    listMine.mockResolvedValue([videoRow, resumeRow]);
    const rows = await LINKED_CONTENT_REGISTRY.template.listForUser();
    expect(rows).toEqual([
      {
        kind: "template",
        id: STUDIO_ID,
        title: "Launch reel",
        subtitle: "Studio template",
      },
      {
        kind: "template",
        id: RESUME_ID,
        title: "Clinical Blue",
        subtitle: "Resume template",
      },
    ]);
  });

  it("fetchSummary returns null on a missing row", async () => {
    getById.mockRejectedValue(new Error("not found"));
    expect(await LINKED_CONTENT_REGISTRY.template.fetchSummary("missing")).toBeNull();
  });

  it("fetchSummary carries the discriminator plus description body", async () => {
    getById.mockResolvedValue(resumeRow);
    const summary = await LINKED_CONTENT_REGISTRY.template.fetchSummary(RESUME_ID);
    expect(summary).toMatchObject({
      kind: "template",
      id: RESUME_ID,
      title: "Clinical Blue",
      subtitle: "Resume template",
      body: ["Two-column clinical résumé."],
    });
  });
});
