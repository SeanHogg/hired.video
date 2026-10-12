/**
 * Template kind on template cards: `templateMetaKind` resolves what a
 * TemplateMeta makes from every origin (built-in résumé preset, studio
 * built-in, creator row), and <TemplateKindChip> renders the shared,
 * localized label for it (@shared/template-kinds).
 *
 * Fixtures mirror real `/api/studio/templates` rows: a creator résumé
 * template folded in by mig 0520 (documentKind 'resume') and an ordinary
 * published podcast template (documentKind null).
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { StudioTemplate } from "@/lib/services/studio-templates-service";
import { fromStudioCreator, getStaticTemplates } from "@/lib/templates/registry";
import { templateMetaKind } from "@/lib/templates/types";
import { TEMPLATE_CATALOG as STUDIO_BUILTIN_CATALOG } from "@/lib/studio/templates/catalog";
import TemplateKindChip from "@/components/templates/TemplateKindChip";

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
  mediaKind: "document",
  documentKind: "resume",
  listingSlug: "clinical-blue",
});

const podcastRow = row({
  id: "0d9b8a7c-6e5f-4a3b-8c2d-1e0f9a8b7c6d",
  name: "Founder interview",
  mediaKind: "podcast",
});

describe("templateMetaKind", () => {
  it("creator résumé template → document / resume", () => {
    expect(templateMetaKind(fromStudioCreator(resumeRow))).toEqual({
      mediaKind: "document",
      documentKind: "resume",
    });
  });

  it("creator podcast template → podcast / null", () => {
    expect(templateMetaKind(fromStudioCreator(podcastRow))).toEqual({
      mediaKind: "podcast",
      documentKind: null,
    });
  });

  it("built-in résumé presets → document / resume", () => {
    const preset = getStaticTemplates().find((m) => m.origin.kind === "resume");
    expect(preset).toBeDefined();
    expect(templateMetaKind(preset!)).toEqual({ mediaKind: "document", documentKind: "resume" });
  });

  it("studio built-ins carry their catalog mediaKind + document entity kind", () => {
    const builtins = getStaticTemplates().filter((m) => m.origin.kind === "studio-builtin");
    expect(builtins.length).toBe(STUDIO_BUILTIN_CATALOG.length);
    for (const meta of builtins) {
      if (meta.origin.kind !== "studio-builtin") continue;
      expect(templateMetaKind(meta)).toEqual({
        mediaKind: meta.origin.def.mediaKind,
        documentKind: meta.origin.def.documentEntityKind ?? null,
      });
    }
  });
});

describe("<TemplateKindChip>", () => {
  it("labels a résumé template 'Résumé'", () => {
    render(<TemplateKindChip mediaKind="document" documentKind="resume" />);
    expect(screen.getByText("Résumé")).toBeInTheDocument();
  });

  it("labels a video template 'Video' (always shown on template cards)", () => {
    render(<TemplateKindChip mediaKind="video" documentKind={null} />);
    expect(screen.getByText("Video")).toBeInTheDocument();
  });

  it("falls back to 'Template' for an unknown kind instead of a raw key", () => {
    render(<TemplateKindChip mediaKind="hologram" />);
    expect(screen.getByText("Template")).toBeInTheDocument();
  });
});
