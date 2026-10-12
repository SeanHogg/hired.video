/**
 * Tiptap (ProseMirror JSON) → document blocks (#2154a): an article written in
 * the bespoke ArticleEditor keeps its structure when it opens on the document
 * canvas. One top-level node becomes one block; a text block's text is the
 * node as markdown (headings `##`, lists `-` / `1.`, quotes `>`, fenced code,
 * inline bold / italic / strike / code / links), so `documentToArticle`
 * writes the same markdown back and the round trip keeps the formatting the
 * StarterKit editor can produce. A horizontal rule is a divider block and an
 * image node an image block.
 *
 * Pure; unknown nodes fall back to their plain text so nothing is dropped.
 */
import type { DocumentBlock } from "@/lib/studio/editor-v2/document-state";

interface PmMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface PmNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: PmMark[];
  content?: PmNode[];
}

/** A ProseMirror doc (`{ type: "doc", content: [...] }`), or null. */
export function asTiptapDoc(json: unknown): PmNode | null {
  if (!json || typeof json !== "object") return null;
  const doc = json as PmNode;
  return doc.type === "doc" && Array.isArray(doc.content) ? doc : null;
}

const MARK_WRAP: Record<string, string> = { bold: "**", italic: "*", strike: "~~", code: "`" };

function inlineText(node: PmNode): string {
  if (node.type === "hardBreak") return "  \n";
  if (node.type === "text") {
    let out = node.text ?? "";
    for (const mark of node.marks ?? []) {
      const wrap = MARK_WRAP[mark.type];
      if (wrap) out = `${wrap}${out}${wrap}`;
      else if (mark.type === "link" && typeof mark.attrs?.href === "string") out = `[${out}](${mark.attrs.href})`;
    }
    return out;
  }
  return (node.content ?? []).map(inlineText).join("");
}

function listMarkdown(list: PmNode, depth: number): string {
  const ordered = list.type === "orderedList";
  const start = typeof list.attrs?.start === "number" ? list.attrs.start : 1;
  const indent = "  ".repeat(depth);
  return (list.content ?? [])
    .map((item, i) => {
      const marker = ordered ? `${start + i}.` : "-";
      const parts = (item.content ?? []).map((child) =>
        child.type === "bulletList" || child.type === "orderedList" ? `\n${listMarkdown(child, depth + 1)}` : inlineText(child),
      );
      return `${indent}${marker} ${parts.join("")}`;
    })
    .join("\n");
}

/** One top-level node as markdown. */
export function nodeMarkdown(node: PmNode): string {
  switch (node.type) {
    case "heading": {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level) || 2));
      return `${"#".repeat(level)} ${inlineText(node)}`;
    }
    case "bulletList":
    case "orderedList":
      return listMarkdown(node, 0);
    case "blockquote":
      return (node.content ?? [])
        .map(nodeMarkdown)
        .join("\n\n")
        .split("\n")
        .map((line) => (line ? `> ${line}` : ">"))
        .join("\n");
    case "codeBlock": {
      const lang = typeof node.attrs?.language === "string" ? node.attrs.language : "";
      return `\`\`\`${lang}\n${(node.content ?? []).map((c) => c.text ?? "").join("")}\n\`\`\``;
    }
    default:
      return inlineText(node);
  }
}

/** The doc's top-level nodes as flow blocks (ids from `idFactory`). */
export function tiptapToBlocks(doc: PmNode, idFactory: () => string): DocumentBlock[] {
  const blocks: DocumentBlock[] = [];
  for (const node of doc.content ?? []) {
    if (node.type === "horizontalRule") {
      blocks.push({ id: idFactory(), kind: "divider", mode: "flow" });
      continue;
    }
    if (node.type === "image" && typeof node.attrs?.src === "string") {
      blocks.push({ id: idFactory(), kind: "image", imageUrl: node.attrs.src, mode: "flow" });
      continue;
    }
    const text = nodeMarkdown(node).trim();
    if (text) blocks.push({ id: idFactory(), kind: "text", text, mode: "flow" });
  }
  return blocks;
}
