/**
 * document-from-article — reverse of `document-to-article` (#1914): open an
 * existing `articles` row on the document canvas by converting its markdown
 * body into a `DocumentState` bound to the article (`entityId`). Lets a
 * pre-existing article be edited on the canvas; saving writes back via the
 * entity-aware document-persistence path.
 *
 * Conversion (paragraph-level, intentionally simple — full markdown/Tiptap
 * fidelity is a follow-up): title → a text block; blank-line-separated
 * paragraphs → text blocks; a lone `![alt](url)` → image block; `---` →
 * divider.
 */
import {
  type DocumentBlock,
  type DocumentState,
  createBlankDocumentState,
} from "../editor-v2/document-state";

export function articleToDocumentState(
  article: { id: string; title: string; bodyMd: string },
  idFactory: () => string,
): DocumentState {
  const blocks: DocumentBlock[] = [
    {
      id: idFactory(),
      kind: "text",
      title: "Title",
      text: article.title || "Title",
      mode: "flow",
    },
  ];
  const paras = (article.bodyMd || "")
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const p of paras) {
    const img = p.match(/^!\[[^\]]*\]\(([^)]+)\)$/);
    if (img) {
      blocks.push({ id: idFactory(), kind: "image", imageUrl: img[1], mode: "flow" });
    } else if (p === "---") {
      blocks.push({ id: idFactory(), kind: "divider", mode: "flow" });
    } else {
      blocks.push({ id: idFactory(), kind: "text", text: p, mode: "flow" });
    }
  }
  const base = createBlankDocumentState("article", idFactory);
  return {
    ...base,
    entityId: article.id,
    pages: [{ id: idFactory(), blocks, overlays: [] }],
  };
}
