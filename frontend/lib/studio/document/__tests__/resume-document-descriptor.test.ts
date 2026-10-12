/**
 * Free blocks on a résumé document (#2101(2)): text / image / divider /
 * spacer blocks render in place through the declarative engine instead of
 * being dropped, and survive the descriptor ↔ document round trip.
 *
 * Run: vitest run lib/studio/document/__tests__/resume-document-descriptor.test.ts
 */
import { describe, expect, it } from "vitest";
import { createResumeDocumentState, type DocumentBlock, type DocumentState } from "../../editor-v2/document-state";
import { descriptorFromResumeDocument } from "../resume-document-descriptor";
import { documentFromDescriptor } from "@/lib/templates/resume-design-document";
import { DEFAULT_DESCRIPTOR, blockId } from "@/types/resume-template";

function counter() {
  let n = 0;
  return () => `id${++n}`;
}

function withBlocks(blocks: DocumentBlock[]): DocumentState {
  const s = createResumeDocumentState("6fd07e16-f141-4a82-9baa-f56dcc4aa566", ["work"], counter());
  return { ...s, pages: [{ ...s.pages[0], blocks }] };
}

const section = (id: string, key: string): DocumentBlock => ({ id, kind: "section", sectionKey: key, title: key, layout: "list", mode: "flow" });

describe("descriptorFromResumeDocument — free blocks", () => {
  it("keeps text / image / divider / spacer in order, keyed by their own ids", () => {
    const d = descriptorFromResumeDocument(
      withBlocks([
        section("b0", "basics"),
        section("b1", "work"),
        { id: "t1", kind: "text", title: "Text", text: "Open to relocation.", mode: "flow" },
        { id: "d1", kind: "divider", mode: "flow" },
        section("b2", "skills"),
        { id: "i1", kind: "image", imageUrl: "https://cdn.hired.video/u/logo.png", mode: "flow" },
        { id: "s1", kind: "spacer", mode: "flow" },
      ]),
    );
    expect(d.sections.map(blockId)).toEqual(["work", "t1", "d1", "skills", "i1", "s1"]);
    expect(d.sections[1]).toEqual({
      kind: "component",
      id: "t1",
      component: "document-block",
      enabled: true,
      props: { kind: "text", text: "Open to relocation." },
    });
    expect(d.hero.enabled).toBe(true);
  });

  it("free blocks alone keep the template's sections, with the blocks after them", () => {
    const d = descriptorFromResumeDocument(withBlocks([{ id: "t1", kind: "text", text: "Hi", mode: "flow" }]));
    const templateIds = DEFAULT_DESCRIPTOR.sections.map(blockId);
    expect(d.sections.map(blockId)).toEqual([...templateIds, "t1"]);
    expect(d.hero).toEqual(DEFAULT_DESCRIPTOR.hero);
  });

  it("absolute blocks stay out of the flow render (boundary)", () => {
    const d = descriptorFromResumeDocument(
      withBlocks([section("b1", "work"), { id: "t9", kind: "text", text: "floating", mode: "absolute", box: { x: 0, y: 0, width: 0.2, height: 0.1, z: 1 } }]),
    );
    expect(d.sections.map(blockId)).toEqual(["work"]);
  });

  it("round-trips through documentFromDescriptor without losing a free block", () => {
    const d = descriptorFromResumeDocument(
      withBlocks([section("b0", "basics"), section("b1", "work"), { id: "t1", kind: "text", text: "Note", mode: "flow" }]),
    );
    const doc = documentFromDescriptor(d);
    expect(doc.pages[0].blocks.find((b) => b.id === "t1")).toEqual({ id: "t1", kind: "text", text: "Note", mode: "flow" });
    expect(descriptorFromResumeDocument(doc).sections.map(blockId)).toEqual(d.sections.map(blockId));
  });
});
