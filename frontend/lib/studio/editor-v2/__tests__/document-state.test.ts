/**
 * DocumentState model tests (#1912) — page geometry, per-entity capabilities,
 * and the seed factories (`createBlankDocumentState` / `createResumeDocumentState`).
 *
 * Run: vitest run lib/studio/editor-v2/__tests__/document-state.test.ts
 */
import { describe, it, expect } from "vitest";
import {
  createBlankDocumentState,
  createJobDocumentState,
  createResumeDocumentState,
  documentSupportsPageMode,
  pageDimensions,
  PAGE_DIMENSIONS_PX,
  DOCUMENT_ENTITY_KINDS,
} from "../document-state";

// Deterministic id factory so block ids are stable + assertable.
function counter() {
  let n = 0;
  return () => `id${++n}`;
}

describe("pageDimensions", () => {
  it("returns Letter portrait dims unchanged", () => {
    const d = pageDimensions({ pageSize: "letter", orientation: "portrait" });
    expect(d).toEqual(PAGE_DIMENSIONS_PX.letter);
    expect(d).toEqual({ width: 816, height: 1056 });
  });

  it("swaps width/height for landscape", () => {
    const d = pageDimensions({ pageSize: "letter", orientation: "landscape" });
    expect(d).toEqual({ width: 1056, height: 816 });
  });

  it("handles legal + a4", () => {
    expect(pageDimensions({ pageSize: "legal", orientation: "portrait" })).toEqual({ width: 816, height: 1344 });
    expect(pageDimensions({ pageSize: "a4", orientation: "portrait" })).toEqual({ width: 794, height: 1123 });
  });
});

describe("documentSupportsPageMode", () => {
  it("every document kind gets configurable page mode (paged geometry)", () => {
    // DOCUMENT_ENTITY_CAPABILITIES sets configurablePageMode: true explicitly
    // for all four kinds — a resume/job/article/blog authored as a paged
    // document can pick Letter/A4 × orientation. (The earlier "resume only"
    // assertion drifted from the widened capability map.)
    expect(documentSupportsPageMode("resume")).toBe(true);
    expect(documentSupportsPageMode("article")).toBe(true);
    expect(documentSupportsPageMode("job")).toBe(true);
    expect(documentSupportsPageMode("blog")).toBe(true);
  });

  it("covers every entity kind", () => {
    for (const k of DOCUMENT_ENTITY_KINDS) {
      expect(typeof documentSupportsPageMode(k)).toBe("boolean");
    }
  });
});

describe("createBlankDocumentState", () => {
  it("seeds a resume with Header + core sections", () => {
    const s = createBlankDocumentState("resume", counter());
    expect(s.entityKind).toBe("resume");
    expect(s.entityId).toBeNull();
    expect(s.pageSize).toBe("letter");
    expect(s.orientation).toBe("portrait");
    const keys = s.pages[0].blocks.map((b) => b.sectionKey);
    expect(keys).toEqual(["basics", "work", "education", "skills", "projects"]);
    expect(s.pages[0].blocks.every((b) => b.mode === "flow")).toBe(true);
  });

  it("seeds article/blog with a Title + Body text block", () => {
    for (const kind of ["article", "blog"] as const) {
      const s = createBlankDocumentState(kind, counter());
      expect(s.entityKind).toBe(kind);
      const blocks = s.pages[0].blocks;
      expect(blocks).toHaveLength(2);
      expect(blocks.every((b) => b.kind === "text")).toBe(true);
    }
  });

  it("seeds a job with its posting sections", () => {
    const s = createBlankDocumentState("job", counter());
    expect(s.entityKind).toBe("job");
    const keys = s.pages[0].blocks.map((b) => b.sectionKey);
    expect(keys).toEqual([
      "overview",
      "responsibilities",
      "requirements",
      "compensation",
      "details",
      "publishing",
    ]);
    expect(s.pages[0].blocks.every((b) => b.kind === "section" && b.mode === "flow")).toBe(true);
  });
});

describe("createJobDocumentState", () => {
  it("binds entityId and seeds the posting sections", () => {
    const s = createJobDocumentState("job-123", counter());
    expect(s.entityId).toBe("job-123");
    expect(s.entityKind).toBe("job");
    expect(s.pageSize).toBe("letter");
    expect(s.orientation).toBe("portrait");
    const keys = s.pages[0].blocks.map((b) => b.sectionKey);
    expect(keys).toEqual([
      "overview",
      "responsibilities",
      "requirements",
      "compensation",
      "details",
      "publishing",
    ]);
  });
});

describe("createResumeDocumentState", () => {
  it("binds entityId and includes core + populated sections, never duplicating", () => {
    const s = createResumeDocumentState("resume-123", ["certificates", "work"], counter());
    expect(s.entityId).toBe("resume-123");
    expect(s.entityKind).toBe("resume");
    const keys = s.pages[0].blocks.map((b) => b.sectionKey);
    // basics + core (work/education/skills/projects) + the extra populated
    // "certificates"; "work" was already core so it isn't duplicated.
    expect(keys).toContain("basics");
    expect(keys).toContain("certificates");
    expect(keys.filter((k) => k === "work")).toHaveLength(1);
  });

  it("omits empty non-core sections", () => {
    const s = createResumeDocumentState("r1", [], counter());
    const keys = s.pages[0].blocks.map((b) => b.sectionKey);
    expect(keys).not.toContain("certificates");
    expect(keys).toContain("work");
  });
});
