/**
 * document-to-article — derive a publishable article (title + markdown body)
 * from an article/blog `DocumentState`'s flow blocks (#1914). The canvas
 * blocks are the editable source (persisted in `document_state`); on save the
 * editor upserts an `articles` row from this derivation so a canvas-authored
 * article enters the articles system (public surfaces, moderation, etc.).
 *
 * Mapping (first page, flow order): the first non-empty `text` block becomes
 * the title; remaining `text` blocks become paragraphs; `image` blocks become
 * markdown images; `divider` → `---`. Lossy by design (markdown can't carry
 * absolute layout) — the rich layout stays in `document_state`.
 */
import type { DocumentState } from "@/lib/studio/editor-v2/document-state";

export function documentToArticle(state: DocumentState): { title: string; bodyMd: string } {
  const blocks = state.pages[0]?.blocks ?? [];
  let title = "";
  const lines: string[] = [];
  for (const b of blocks) {
    if (b.mode !== "flow") continue;
    if (b.kind === "text") {
      const text = (b.text ?? "").trim();
      if (!text) continue;
      if (!title) {
        title = text.split("\n")[0].slice(0, 200);
        // Remaining lines of the title block (if any) flow into the body.
        const rest = text.split("\n").slice(1).join("\n").trim();
        if (rest) lines.push(rest);
      } else {
        lines.push(text);
      }
    } else if (b.kind === "image" && b.imageUrl) {
      lines.push(`![](${b.imageUrl})`);
    } else if (b.kind === "divider") {
      lines.push("---");
    } else if (b.kind === "spacer") {
      lines.push("");
    }
  }
  return { title, bodyMd: lines.join("\n\n") };
}
