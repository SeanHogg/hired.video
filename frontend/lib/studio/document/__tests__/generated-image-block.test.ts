/**
 * The document AI panel's sink (#1934(2)): a generated image becomes an image
 * block on the page, never a video-scene widget.
 *
 * Run: vitest run lib/studio/document/__tests__/generated-image-block.test.ts
 */
import { describe, expect, it } from "vitest";
import { createBlankDocumentState, type DocumentState } from "../../editor-v2/document-state";
import { insertGeneratedImageBlock } from "../generated-image-block";

function counter() {
  let n = 0;
  return () => `id${++n}`;
}

const URL_ = "https://cdn.hired.video/studio/scene-images/u1/abc.png";

describe("insertGeneratedImageBlock", () => {
  it("appends an image block with the url to the first page, leaving the rest alone", () => {
    const before = createBlankDocumentState("article", counter());
    const { state, blockId } = insertGeneratedImageBlock(before, URL_);
    const blocks = state.pages[0].blocks;
    expect(blocks).toHaveLength(before.pages[0].blocks.length + 1);
    expect(blocks.slice(0, -1)).toEqual(before.pages[0].blocks);
    expect(blocks.at(-1)).toMatchObject({ id: blockId, kind: "image", imageUrl: URL_, mode: "flow" });
    expect(state.pages[0].overlays).toEqual([]);
  });

  it("inserts before a given block", () => {
    const before = createBlankDocumentState("job", counter());
    const target = before.pages[0].blocks[1].id;
    const { state } = insertGeneratedImageBlock(before, URL_, target);
    expect(state.pages[0].blocks[1]).toMatchObject({ kind: "image", imageUrl: URL_ });
  });

  it("is a no-op on a document with no page", () => {
    const empty: DocumentState = { ...createBlankDocumentState("blog", counter()), pages: [] };
    expect(insertGeneratedImageBlock(empty, URL_).state.pages).toEqual([]);
  });
});
