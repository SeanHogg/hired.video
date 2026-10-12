/**
 * Résumé templates folded into studio templates (owner decision, mig 0520):
 * the migrated read path (a studio_templates row with documentKind 'resume'
 * → a résumé TemplateMeta), what "Use this template" opens, and how a
 * creator's profile groups their templates (#866).
 *
 * Fixtures mirror real API rows: `resumeRow` is a legacy `resume_templates`
 * row as 0520 copies it (id + slug kept, DocumentState payload);
 * `legacyPresetRow` is one whose old template_data only named a built-in
 * design; `videoRow` is an ordinary published video template.
 */
import { describe, expect, it } from "vitest";
import type { StudioTemplate } from "@/lib/services/studio-templates-service";
import { fromStudioCreator, getStaticTemplateBySlug } from "@/lib/templates/registry";
import { isResumeTemplate } from "@/lib/templates/types";
import { groupProfileTemplates } from "@/lib/templates/profile-groups";
import { applyHrefFor, cartIdFor, nextAction, unlockKeyFor } from "@/lib/templates/apply-targets";
import {
  descriptorForDesign,
  isResumeStudioTemplate,
  resumeTemplateDesign,
} from "@/lib/templates/resume-template-design";
import { resumeTemplateHref } from "@/lib/studio/resume-editor-link";

function row(p: Partial<StudioTemplate> & Pick<StudioTemplate, "id" | "name">): StudioTemplate {
  return {
    creatorId: "3b9f0c1e-7d2a-4f5b-8e6c-1a2b3c4d5e6f",
    companyId: null,
    sourceProjectId: null,
    mediaKind: "video",
    documentKind: null,
    description: null,
    thumbnailUrl: null,
    previewVideoUrl: null,
    videoScript: null,
    durationSec: null,
    motion: null,
    language: null,
    tags: [],
    visibility: "public",
    listingSlug: null,
    priceCents: 0,
    currency: "USD",
    platformFeeBps: 500,
    consentAgreedAt: "2026-03-02T17:04:11.000Z",
    viewCount: 0,
    purchaseCount: 0,
    publishedAt: "2026-03-02T17:04:11.000Z",
    createdAt: "2026-03-01T09:12:40.000Z",
    updatedAt: "2026-03-02T17:04:11.000Z",
    ...p,
  };
}

const resumeRow = row({
  id: "6f1c2a9e-0b7d-4e7a-9a51-3c2d1e0f9a88",
  name: "Clinical Blue, two column",
  description: "Two-column layout for nurses and allied health.",
  mediaKind: "document",
  documentKind: "resume",
  listingSlug: "clinical-blue-two-column-3fa9c1d2",
  priceCents: 299,
  tags: ["healthcare"],
  videoScript: {
    entityKind: "resume",
    entityId: null,
    templateId: "healthcare-clinical-blue",
    pageSize: "letter",
    orientation: "portrait",
    columns: 12,
    theme: { key: "clinical-blue", fontFamily: "Inter", accent: "#1d4ed8" },
    pages: [
      {
        id: "page-1",
        blocks: [
          { id: "b-basics", kind: "section", key: "basics", mode: "flow" },
          { id: "b-work", kind: "section", key: "work", mode: "flow" },
          { id: "b-education", kind: "section", key: "education", mode: "flow" },
        ],
        overlays: [],
      },
    ],
  },
});

const legacyPresetRow = row({
  id: "b2c4e6a8-1d3f-4b5a-9c7e-0f2a4c6e8a1b",
  name: "Payroll (legacy)",
  mediaKind: "document",
  documentKind: "resume",
  listingSlug: "payroll-legacy-b2c4e6a8",
  videoScript: {
    entityKind: "resume",
    entityId: null,
    pages: [],
    templateId: "payroll-iron-gray",
    legacyTemplateData: { id: "payroll-iron-gray", accent: "slate" },
  },
});

const videoRow = row({
  id: "0d8e1c55-2f6a-4b1e-8c3d-6a7b9e0f1a2b",
  name: "Launch reel",
  listingSlug: "launch-reel-a1b2c3d4",
  priceCents: 499,
  videoScript: { title: "Launch", scenes: [{ kind: "scene", text: "Hello" }] },
});

const jobRow = row({
  id: "9a7b6c5d-4e3f-4a1b-9c8d-7e6f5a4b3c2d",
  name: "Engineering job post",
  mediaKind: "document",
  documentKind: "job",
  videoScript: { entityKind: "job", entityId: null, pages: [{ id: "p1", blocks: [], overlays: [] }] },
});

describe("a résumé template is a studio template with documentKind 'resume'", () => {
  it("is recognised by its columns, not its payload", () => {
    expect(isResumeStudioTemplate(resumeRow)).toBe(true);
    expect(isResumeStudioTemplate(jobRow)).toBe(false);
    expect(isResumeStudioTemplate(videoRow)).toBe(false);
  });

  it("carries a page layout, bound to no entity", () => {
    const design = resumeTemplateDesign(resumeRow);
    expect(design?.kind).toBe("layout");
    if (design?.kind !== "layout") return;
    expect(design.layout.entityKind).toBe("resume");
    expect(design.layout.entityId).toBeNull();
    expect(design.layout.pages[0]?.blocks.map((b) => b.id)).toEqual(["b-basics", "b-work", "b-education"]);
  });

  it("falls back to the built-in design a legacy row named", () => {
    expect(resumeTemplateDesign(legacyPresetRow)).toEqual({ kind: "preset", templateId: "payroll-iron-gray" });
  });

  it("has no résumé design when it is not a résumé template or names nothing renderable", () => {
    expect(resumeTemplateDesign(videoRow)).toBeNull();
    expect(resumeTemplateDesign(jobRow)).toBeNull();
    expect(
      resumeTemplateDesign({ ...legacyPresetRow, videoScript: { entityKind: "resume", pages: [], templateId: "gone" } }),
    ).toBeNull();
  });

  it("renders through the résumé descriptor of its base design", () => {
    const design = resumeTemplateDesign(resumeRow);
    expect(design && descriptorForDesign(design)?.id).toBe("healthcare-clinical-blue");
  });
});

describe("the migrated read path → TemplateMeta", () => {
  it("makes a creator résumé template a résumé template on every surface", () => {
    const meta = fromStudioCreator(resumeRow);
    expect(meta.kind).toBe("studio-creator");
    expect(meta.slug).toBe("clinical-blue-two-column-3fa9c1d2");
    expect(isResumeTemplate(meta)).toBe(true);
    expect(meta.resumeDescriptor?.id).toBe("healthcare-clinical-blue");
    expect(meta.tags).toEqual(["resume", "creator", "healthcare"]);
    expect(meta.priceCents).toBe(299);
  });

  it("stays a résumé template even when its payload carries nothing renderable", () => {
    const bare = fromStudioCreator({ ...legacyPresetRow, videoScript: { entityKind: "resume", entityId: null, pages: [] } });
    expect(isResumeTemplate(bare)).toBe(true);
    expect(bare.resumeDescriptor?.id).toBe("hired-default");
  });

  it("keeps video templates on the video surfaces", () => {
    const meta = fromStudioCreator(videoRow);
    expect(isResumeTemplate(meta)).toBe(false);
    expect(meta.tags).toEqual(["video", "creator"]);
  });

  it("built-in résumé presets are résumé templates too", () => {
    const preset = getStaticTemplateBySlug("hired-default");
    expect(preset && isResumeTemplate(preset)).toBe(true);
  });
});

describe("Use this template", () => {
  const creatorResume = fromStudioCreator(resumeRow);
  const preset = getStaticTemplateBySlug("payroll-iron-gray")!;

  it("opens the master résumé wearing a résumé template, preset or creator", () => {
    const master = "5e4d3c2b-1a09-4f8e-b7d6-c5b4a3928170";
    expect(applyHrefFor(creatorResume, master)).toBe(
      `/studio/resume/${master}?design=clinical-blue-two-column-3fa9c1d2`,
    );
    expect(applyHrefFor(preset, master)).toBe(`/studio/resume/${master}?design=payroll-iron-gray`);
  });

  it("opens a new kit wearing it when there is no master résumé", () => {
    expect(applyHrefFor(creatorResume)).toBe("/studio/new?start=resume&design=clinical-blue-two-column-3fa9c1d2");
    expect(resumeTemplateHref("payroll-iron-gray", null)).toBe("/studio/new?start=resume&design=payroll-iron-gray");
  });

  it("returns video templates to their marketplace page", () => {
    expect(applyHrefFor(fromStudioCreator(videoRow))).toBe("/marketplace/templates/launch-reel-a1b2c3d4");
  });

  it("licenses every creator template by id under 'studio', résumé ones included", () => {
    expect(unlockKeyFor(creatorResume)).toEqual({ id: resumeRow.id, kind: "studio" });
    expect(cartIdFor(creatorResume)).toBe(`template:studio:${resumeRow.id}`);
    expect(unlockKeyFor(preset)).toEqual({ id: "payroll-iron-gray", kind: "resume" });
  });

  it("asks to buy a paid creator résumé template, uses a free preset directly", () => {
    expect(nextAction(creatorResume, { isAuthed: true, isOwned: false })).toBe("buy");
    expect(nextAction(creatorResume, { isAuthed: true, isOwned: true })).toBe("use");
    expect(nextAction(preset, { isAuthed: false, isOwned: false })).toBe("use");
  });
});

describe("profile Templates tab (#866)", () => {
  it("lists résumé templates alongside the rest, grouped by kind, in listing order", () => {
    const groups = groupProfileTemplates([videoRow, resumeRow, jobRow, legacyPresetRow]);
    expect(groups.resume.map((m) => m.name)).toEqual(["Clinical Blue, two column", "Payroll (legacy)"]);
    expect(groups.other.map((m) => m.name)).toEqual(["Launch reel", "Engineering job post"]);
  });

  it("is empty for a creator with nothing public", () => {
    expect(groupProfileTemplates([])).toEqual({ resume: [], other: [] });
  });
});
