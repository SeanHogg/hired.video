/**
 * Design-template bridge tests (#1917).
 *
 * `documentTemplatesForEntity()` + `applyDocumentTemplate()` are the seam that
 * surfaces the resume / job design presets inside the document canvas. These
 * tests pin the contract that prompted the work: the studio MUST offer the
 * existing design libraries for resume + job, and applying one swaps structure
 * + theme WITHOUT touching the bound content (entityId / overlays / kind).
 *
 * Run: vitest run lib/studio/editor-v2/__tests__/document-templates.test.ts
 */

import { describe, it, expect } from "vitest";
import { TEMPLATE_PRESETS } from "@/types/resume-template";
import { JOB_TEMPLATE_PRESETS } from "@/types/job-template";
import {
  createBlankDocumentState,
  type DocumentState,
} from "../document-state";
import {
  applyDocumentTemplate,
  documentTemplatesForEntity,
} from "../document-templates";

let counter = 0;
const idFactory = () => `id_${counter++}`;

function blank(kind: Parameters<typeof createBlankDocumentState>[0]): DocumentState {
  return createBlankDocumentState(kind, idFactory);
}

describe("documentTemplatesForEntity", () => {
  it("returns the full resume design library for resume", () => {
    const options = documentTemplatesForEntity("resume");
    expect(options).toHaveLength(TEMPLATE_PRESETS.length);
    expect(options.map((o) => o.id)).toContain("hired-default");
    // Every option carries a theme + at least one section block.
    for (const o of options) {
      expect(o.theme.themeKey).toBeTruthy();
      expect(o.sections.length).toBeGreaterThan(0);
    }
  });

  it("returns the job design library for job", () => {
    const options = documentTemplatesForEntity("job");
    expect(options).toHaveLength(JOB_TEMPLATE_PRESETS.length);
    expect(options.map((o) => o.id)).toContain("hired-job-default");
  });

  it("returns none for entities without a descriptor library (article / blog)", () => {
    expect(documentTemplatesForEntity("article")).toEqual([]);
    expect(documentTemplatesForEntity("blog")).toEqual([]);
  });

  it("only normalizes ENABLED descriptor sections into blocks", () => {
    // The intern preset reorders + keeps a subset; assert no disabled leakage
    // by cross-checking against the source descriptor's enabled count.
    const options = documentTemplatesForEntity("resume");
    const intern = options.find((o) => o.id === "intern-education-first")!;
    const descriptor = TEMPLATE_PRESETS.find((t) => t.id === "intern-education-first")!;
    const enabledCount = descriptor.sections.filter((s) => s.enabled).length;
    expect(intern.sections).toHaveLength(enabledCount);
    expect(intern.sections.every((s) => s.kind === "section" || s.kind === "component")).toBe(true);
  });
});

describe("applyDocumentTemplate", () => {
  it("swaps page-0 blocks for the template's sections with fresh ids", () => {
    const state = blank("resume");
    const option = documentTemplatesForEntity("resume").find((o) => o.id === "hired-default")!;
    const next = applyDocumentTemplate(state, option, idFactory);

    expect(next.pages[0].blocks).toHaveLength(option.sections.length);
    // Each block gets a unique id + flow mode + the spec's binding.
    const ids = next.pages[0].blocks.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(next.pages[0].blocks.every((b) => b.mode === "flow")).toBe(true);
    expect(next.pages[0].blocks[0].sectionKey ?? next.pages[0].blocks[0].component).toBeTruthy();
  });

  it("adopts the template theme", () => {
    const state = blank("resume");
    const option = documentTemplatesForEntity("resume").find((o) => o.id === "software-engineer-graphite")!;
    const next = applyDocumentTemplate(state, option, idFactory);
    expect(next.theme.themeKey).toBe("dev-graphite");
    expect(next.theme.fontFamily).toBe("mono");
  });

  it("preserves content binding + overlays + entity kind (structure-only)", () => {
    const base = blank("resume");
    const state: DocumentState = {
      ...base,
      entityId: "resume-123",
      pages: [{ ...base.pages[0], overlays: [{ widget: { id: "w1" } as never }] }],
    };
    const option = documentTemplatesForEntity("resume")[1];
    const next = applyDocumentTemplate(state, option, idFactory);

    expect(next.entityId).toBe("resume-123");
    expect(next.entityKind).toBe("resume");
    expect(next.pages[0].overlays).toHaveLength(1);
  });

  it("applies a JOB template's job sections", () => {
    const state = blank("job");
    const option = documentTemplatesForEntity("job").find((o) => o.id === "hired-job-default")!;
    const next = applyDocumentTemplate(state, option, idFactory);
    const keys = next.pages[0].blocks.map((b) => b.sectionKey);
    expect(keys).toContain("description");
    expect(keys).toContain("apply");
  });
});
