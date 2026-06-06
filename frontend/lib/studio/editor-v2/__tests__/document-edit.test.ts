/**
 * Pure DocumentState mutation tests (#1912) — add/remove/move/update blocks,
 * flow↔absolute mode, overlays, page setup, and the per-entity palette.
 *
 * Run: vitest run lib/studio/editor-v2/__tests__/document-edit.test.ts
 */
import { describe, it, expect } from "vitest";
import { createBlankDocumentState } from "../document-state";
import {
  addBlock,
  insertBlockAt,
  removeBlock,
  updateBlock,
  moveBlock,
  setBlockMode,
  setPageSize,
  setOrientation,
  firstPageId,
  blockPresetsForEntity,
  RESUME_BLOCK_PRESETS,
} from "../document-edit";

function counter() {
  let n = 0;
  return () => `id${++n}`;
}
// A blank job doc has no seeded blocks — the cleanest base for block tests.
function blankDoc() {
  return createBlankDocumentState("job", counter());
}
const textPreset = { kind: "text" as const, label: "Text" };

describe("addBlock", () => {
  it("appends a block to the page and returns its id", () => {
    const s0 = blankDoc();
    const pid = firstPageId(s0);
    const { state, blockId } = addBlock(s0, pid, textPreset);
    expect(state.pages[0].blocks).toHaveLength(1);
    expect(state.pages[0].blocks[0].id).toBe(blockId);
    expect(state.pages[0].blocks[0].kind).toBe("text");
    // immutability — original untouched
    expect(s0.pages[0].blocks).toHaveLength(0);
  });
});

describe("removeBlock / updateBlock", () => {
  it("removes by id", () => {
    let s = blankDoc();
    const pid = firstPageId(s);
    const added = addBlock(s, pid, textPreset);
    s = added.state;
    s = removeBlock(s, pid, added.blockId);
    expect(s.pages[0].blocks).toHaveLength(0);
  });

  it("patches a block's fields", () => {
    let s = blankDoc();
    const pid = firstPageId(s);
    const added = addBlock(s, pid, textPreset);
    s = updateBlock(added.state, pid, added.blockId, { text: "Hello" });
    expect(s.pages[0].blocks[0].text).toBe("Hello");
  });
});

describe("insertBlockAt (drop-at-cursor)", () => {
  it("inserts before the given block id", () => {
    let s = blankDoc();
    const pid = firstPageId(s);
    s = addBlock(s, pid, { kind: "text", label: "A" }).state;
    s = addBlock(s, pid, { kind: "text", label: "B" }).state;
    const [, b] = s.pages[0].blocks;
    const { state, blockId } = insertBlockAt(s, pid, { kind: "divider", label: "D" }, b.id);
    const ids = state.pages[0].blocks.map((x) => x.id);
    // new block sits immediately before B
    expect(ids.indexOf(blockId)).toBe(ids.indexOf(b.id) - 1);
    expect(state.pages[0].blocks).toHaveLength(3);
  });

  it("appends when beforeId is null or unknown", () => {
    let s = blankDoc();
    const pid = firstPageId(s);
    s = addBlock(s, pid, { kind: "text", label: "A" }).state;
    const r1 = insertBlockAt(s, pid, { kind: "divider", label: "D" }, null);
    expect(r1.state.pages[0].blocks[r1.state.pages[0].blocks.length - 1].id).toBe(r1.blockId);
    const r2 = insertBlockAt(s, pid, { kind: "divider", label: "D" }, "nope");
    expect(r2.state.pages[0].blocks[r2.state.pages[0].blocks.length - 1].id).toBe(r2.blockId);
  });
});

describe("moveBlock", () => {
  it("reorders within the page and clamps at the ends", () => {
    let s = blankDoc();
    const pid = firstPageId(s);
    s = addBlock(s, pid, { kind: "text", label: "A" }).state;
    s = addBlock(s, pid, { kind: "text", label: "B" }).state;
    const [a, b] = s.pages[0].blocks;
    // move B up → [B, A]
    s = moveBlock(s, pid, b.id, "up");
    expect(s.pages[0].blocks.map((x) => x.id)).toEqual([b.id, a.id]);
    // moving the top one further up is a no-op
    s = moveBlock(s, pid, b.id, "up");
    expect(s.pages[0].blocks.map((x) => x.id)).toEqual([b.id, a.id]);
  });
});

describe("setBlockMode", () => {
  it("detaches to absolute with a box, and re-flows clearing the box", () => {
    let s = blankDoc();
    const pid = firstPageId(s);
    const { state, blockId } = addBlock(s, pid, textPreset);
    s = setBlockMode(state, pid, blockId, "absolute");
    const abs = s.pages[0].blocks[0];
    expect(abs.mode).toBe("absolute");
    expect(abs.box).toBeDefined();
    s = setBlockMode(s, pid, blockId, "flow");
    expect(s.pages[0].blocks[0].mode).toBe("flow");
    expect(s.pages[0].blocks[0].box).toBeUndefined();
  });
});

describe("page setup", () => {
  it("sets page size + orientation", () => {
    let s = createBlankDocumentState("resume", counter());
    s = setPageSize(s, "legal");
    s = setOrientation(s, "landscape");
    expect(s.pageSize).toBe("legal");
    expect(s.orientation).toBe("landscape");
  });
});

describe("blockPresetsForEntity", () => {
  it("returns the resume section palette for resume", () => {
    expect(blockPresetsForEntity("resume")).toBe(RESUME_BLOCK_PRESETS);
    expect(blockPresetsForEntity("resume").some((p) => p.sectionKey === "work")).toBe(true);
  });

  it("returns only free-content primitives for article/blog", () => {
    for (const kind of ["article", "blog"] as const) {
      const presets = blockPresetsForEntity(kind);
      expect(presets.length).toBeGreaterThan(0);
      // no section-bound presets — article/blog have no section model yet
      expect(presets.every((p) => p.kind !== "section")).toBe(true);
    }
  });
});
