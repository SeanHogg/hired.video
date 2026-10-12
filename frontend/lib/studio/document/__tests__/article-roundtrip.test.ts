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
import { articleToDocumentState, splitMarkdownBlocks } from "../document-from-article";
import { asTiptapDoc } from "../tiptap-to-blocks";

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

describe("block model (#2154a) — markdown blocks", () => {
  it("keeps a fenced code block with blank lines as ONE block", () => {
    const md = "Intro.\n\n```ts\nconst a = 1;\n\nconst b = 2;\n```\n\n## Next\n\n- one\n- two";
    expect(splitMarkdownBlocks(md)).toEqual(["Intro.", "```ts\nconst a = 1;\n\nconst b = 2;\n```", "## Next", "- one\n- two"]);
  });

  it("treats an unclosed fence as running to the end (nothing lost)", () => {
    expect(splitMarkdownBlocks("a\n\n```\ncode\n\nmore")).toEqual(["a", "```\ncode\n\nmore"]);
  });

  it("round-trips headings, lists, quotes and code through the canvas unchanged", () => {
    const bodyMd = "## Why\n\n1. First\n2. Second\n\n> Quoted\n> twice\n\n```\nx\n\ny\n```\n\n***\n\n![cover](https://cdn.hired.video/a.png \"Cover\")";
    const doc = articleToDocumentState({ id: "a1", title: "Guide", bodyMd }, counter());
    expect(doc.pages[0].blocks.map((b) => b.kind)).toEqual(["text", "text", "text", "text", "text", "divider", "image"]);
    const back = documentToArticle(doc);
    expect(back.title).toBe("Guide");
    expect(back.bodyMd).toBe("## Why\n\n1. First\n2. Second\n\n> Quoted\n> twice\n\n```\nx\n\ny\n```\n\n---\n\n![](https://cdn.hired.video/a.png)");
  });

  it("strips a markdown heading marker from the title", () => {
    const doc = docWithBlocks([
      { id: "1", kind: "text", text: "# Big Title", mode: "flow" },
      { id: "2", kind: "text", text: "Body", mode: "flow" },
    ]);
    expect(documentToArticle(doc).title).toBe("Big Title");
  });
});

describe("block model (#2154a) — Tiptap JSON", () => {
  // The shape ArticleEditor (StarterKit + Link) stores in `articles.body_json`.
  const bodyJson = {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Setup" }] },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Read the " },
          { type: "text", text: "docs", marks: [{ type: "link", attrs: { href: "https://hired.video/docs", target: "_blank" } }] },
          { type: "text", text: " — it's " },
          { type: "text", text: "fast", marks: [{ type: "bold" }] },
          { type: "hardBreak" },
          { type: "text", text: "really", marks: [{ type: "italic" }] },
        ],
      },
      {
        type: "bulletList",
        content: [
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "one" }] }] },
          {
            type: "listItem",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "two" }] },
              { type: "orderedList", attrs: { start: 1 }, content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "nested" }] }] }] },
            ],
          },
        ],
      },
      { type: "codeBlock", attrs: { language: "ts" }, content: [{ type: "text", text: "a\n\nb" }] },
      { type: "horizontalRule" },
      { type: "paragraph" },
      { type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "Quote" }] }] },
    ],
  };

  it("maps one top-level node to one block, as markdown", () => {
    const doc = articleToDocumentState({ id: "a2", title: "T", bodyMd: "stale md", bodyJson }, counter());
    const [, ...body] = doc.pages[0].blocks;
    expect(body.map((b) => (b.kind === "text" ? b.text : b.kind))).toEqual([
      "## Setup",
      "Read the [docs](https://hired.video/docs) — it's **fast**  \n*really*",
      "- one\n- two\n  1. nested",
      "```ts\na\n\nb\n```",
      "divider",
      "> Quote",
    ]);
  });

  it("falls back to the markdown when the JSON is empty or not a doc", () => {
    for (const json of [{ type: "doc", content: [] }, { foo: 1 }, null, "x"]) {
      const doc = articleToDocumentState({ id: "a3", title: "T", bodyMd: "Para.", bodyJson: json }, counter());
      expect(doc.pages[0].blocks.map((b) => b.text)).toEqual(["T", "Para."]);
    }
  });

  it("asTiptapDoc only accepts a doc node", () => {
    expect(asTiptapDoc(bodyJson)).not.toBeNull();
    expect(asTiptapDoc({ type: "paragraph", content: [] })).toBeNull();
  });
});
