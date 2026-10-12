/**
 * document-from-article — reverse of `document-to-article` (#1914 / #2154a):
 * open an existing `articles` row on the document canvas as a `DocumentState`
 * bound to the article (`entityId`). Saving writes back via the entity-aware
 * document-persistence path (document-entity.ts).
 *
 * The block model: the title is the first text block; the body is one block
 * per markdown block — a paragraph, a heading, a list, a quote or a fenced
 * code block is ONE text block holding its markdown (a fence keeps its blank
 * lines); a lone `![alt](url)` is an image block; `---` / `***` a divider.
 * When the article was written in the Tiptap editor (`bodyJson`), the blocks
 * come from that structure instead (tiptap-to-blocks.ts), which is what the
 * bespoke editor treats as the source of truth.
 */
import {
  type DocumentBlock,
  type DocumentState,
  createBlankDocumentState,
} from "../editor-v2/document-state";
import { asTiptapDoc, tiptapToBlocks } from "./tiptap-to-blocks";

const FENCE = /^(```|~~~)/;
const IMAGE = /^!\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)$/;
const RULE = /^(?:-{3,}|\*{3,}|_{3,})$/;

/** Markdown → its blocks (blank-line separated, fences kept whole). */
export function splitMarkdownBlocks(md: string): string[] {
  const out: string[] = [];
  let current: string[] = [];
  let fence: string | null = null;
  const flush = () => {
    const text = current.join("\n").trim();
    if (text) out.push(text);
    current = [];
  };
  for (const line of (md || "").replace(/\r\n?/g, "\n").split("\n")) {
    const opener = FENCE.exec(line.trim())?.[1] ?? null;
    if (fence) {
      current.push(line);
      if (opener === fence) {
        fence = null;
        flush();
      }
      continue;
    }
    if (opener) {
      flush();
      fence = opener;
      current.push(line);
      continue;
    }
    if (!line.trim()) flush();
    else current.push(line);
  }
  flush();
  return out;
}

function markdownToBlocks(md: string, idFactory: () => string): DocumentBlock[] {
  return splitMarkdownBlocks(md).map((p): DocumentBlock => {
    const img = IMAGE.exec(p);
    if (img) return { id: idFactory(), kind: "image", imageUrl: img[1], mode: "flow" };
    if (RULE.test(p)) return { id: idFactory(), kind: "divider", mode: "flow" };
    return { id: idFactory(), kind: "text", text: p, mode: "flow" };
  });
}

export function articleToDocumentState(
  article: { id: string; title: string; bodyMd: string; bodyJson?: unknown },
  idFactory: () => string,
): DocumentState {
  const titleBlock: DocumentBlock = {
    id: idFactory(),
    kind: "text",
    title: "Title",
    text: article.title || "Title",
    mode: "flow",
  };
  const doc = asTiptapDoc(article.bodyJson);
  const body = doc?.content?.length ? tiptapToBlocks(doc, idFactory) : markdownToBlocks(article.bodyMd, idFactory);
  const base = createBlankDocumentState("article", idFactory);
  return {
    ...base,
    entityId: article.id,
    pages: [{ id: idFactory(), blocks: [titleBlock, ...body], overlays: [] }],
  };
}
