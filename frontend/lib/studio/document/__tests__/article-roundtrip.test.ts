/**
 * Article ↔ document round-trip tests (#1914): blocks → markdown
 * (`documentToArticle`) and markdown → blocks (`articleToDocumentState`).
 *
 * Run: vitest run lib/studio/document/__tests__/article-roundtrip.test.ts
 */
import { describe, it, expect } from "vitest";
import { createBlankDocumentState } from "../../editor-v2/document-state";
import type { DocumentBlock } from "../../editor-v2/document-state";
import { documentToArticle } from "../document-to-article";
import { articleToDocumentState } from "../document-from-article";

function counter() {
  let n = 0;
  return () => `id${++n}`;
}

function docWithBlocks(blocks: DocumentBlock[]) {
  const s = createBlankDocumentState("article", counter());
  return { ...s, pages: [{ id: "p1", blocks, overlays: [] }] };
}

describe("documentToArticle", () => {
  it("takes the first text block as the title and the rest as the body", () => {
    const doc = docWithBlocks([
      { id: "1", kind: "text", text: "My Title", mode: "flow" },
      { id: "2", kind: "text", text: "First paragraph.", mode: "flow" },
      { id: "3", kind: "text", text: "Second paragraph.", mode: "flow" },
    ]);
    const { title, bodyMd } = documentToArticle(doc);
    expect(title).toBe("My Title");
    expect(bodyMd).toBe("First paragraph.\n\nSecond paragraph.");
  });

  it("maps image blocks to markdown images and dividers to ---", () => {
    const doc = docWithBlocks([
      { id: "1", kind: "text", text: "T", mode: "flow" },
      { id: "2", kind: "image", imageUrl: "https://x/y.png", mode: "flow" },
      { id: "3", kind: "divider", mode: "flow" },
    ]);
    const { bodyMd } = documentToArticle(doc);
    expect(bodyMd).toContain("![](https://x/y.png)");
    expect(bodyMd).toContain("---");
  });

  it("ignores absolute blocks and empty text", () => {
    const doc = docWithBlocks([
      { id: "1", kind: "text", text: "Title", mode: "flow" },
      { id: "2", kind: "text", text: "   ", mode: "flow" },
      { id: "3", kind: "text", text: "floating", mode: "absolute", box: { x: 0, y: 0, width: 0.3, height: 0.1, z: 1 } },
    ]);
    const { title, bodyMd } = documentToArticle(doc);
    expect(title).toBe("Title");
    expect(bodyMd).toBe("");
  });
});

describe("articleToDocumentState", () => {
  it("builds a title block + a text block per paragraph, bound to the article id", () => {
    const s = articleToDocumentState(
      { id: "art-1", title: "Hello", bodyMd: "Para one.\n\nPara two." },
      counter(),
    );
    expect(s.entityId).toBe("art-1");
    expect(s.entityKind).toBe("article");
    const blocks = s.pages[0].blocks;
    expect(blocks[0].text).toBe("Hello");
    expect(blocks.filter((b) => b.kind === "text")).toHaveLength(3); // title + 2 paras
  });

  it("parses image + divider paragraphs into the right block kinds", () => {
    const s = articleToDocumentState(
      { id: "a", title: "T", bodyMd: "![alt](http://i/x.png)\n\n---\n\nbody" },
      counter(),
    );
    const kinds = s.pages[0].blocks.map((b) => b.kind);
    expect(kinds).toContain("image");
    expect(kinds).toContain("divider");
    const img = s.pages[0].blocks.find((b) => b.kind === "image");
    expect(img?.imageUrl).toBe("http://i/x.png");
  });
});

describe("round-trip", () => {
  it("blocks → article → blocks preserves title + paragraph text", () => {
    const original = docWithBlocks([
      { id: "1", kind: "text", text: "Round Trip", mode: "flow" },
      { id: "2", kind: "text", text: "Body A.", mode: "flow" },
      { id: "3", kind: "text", text: "Body B.", mode: "flow" },
    ]);
    const { title, bodyMd } = documentToArticle(original);
    const rebuilt = articleToDocumentState({ id: "x", title, bodyMd }, counter());
    const texts = rebuilt.pages[0].blocks.filter((b) => b.kind === "text").map((b) => b.text);
    expect(texts).toEqual(["Round Trip", "Body A.", "Body B."]);
  });
});
