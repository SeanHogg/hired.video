"use client";

/**
 * ArticleEditor — gap #170 / #1569. Tiptap (ProseMirror) wrapper used by
 * every markdown-authoring surface (articles, FAQs, guides, text_md
 * course lessons). The editor produces TWO outputs in lockstep:
 *
 *   - `bodyJson`  — Tiptap document (ProseMirror JSON). Source of truth.
 *   - `bodyMd`    — Markdown derived from the same doc. Kept so the
 *                   moderation classifier (#175) + the static blog
 *                   compatibility layer + ATS exports + ReactMarkdown
 *                   renderers all keep working.
 *
 * Tiptap's `getHTML()` is intentionally NOT serialised — the article
 * renderer rebuilds HTML from the JSON each time so a future schema
 * migration can normalise legacy nodes without re-parsing strings.
 *
 * Callers:
 *   - [[ArticlesManagerPanel]] — /services/creator/articles
 *   - [[CourseContentEditor]]  — /services/creator/courses lesson body
 *
 * The editor calls `onAutosave` ~3 seconds after the last keystroke
 * (when provided), mirroring the studio + resume autosave pattern. The
 * parent owns the actual snapshot create call so it can debounce /
 * pause when the page is in a "publishing" state. Consumers that don't
 * need autosave just provide `onChange` and ignore the timer.
 */

import { useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Button } from "@/components/ui/button";
import { promptDialog } from "@/lib/dialogs";
import {
  Bold,
  Italic,
  Code,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Link as LinkIcon,
  Undo2,
  Redo2,
} from "lucide-react";

interface Props {
  initialJson?: unknown;
  initialMarkdown?: string;
  placeholder?: string;
  readOnly?: boolean;
  /** Fired ~3s after the last edit. Parent decides whether to write to
   *  the autosave endpoint or hold off (e.g. mid-publish). */
  onAutosave?: (doc: { json: unknown; markdown: string; wordCount: number }) => void;
  /** Live changes — every keystroke. Skip this for autosave; use
   *  `onAutosave` instead. Useful for word-count meters etc. */
  onChange?: (doc: { json: unknown; markdown: string; wordCount: number }) => void;
}

/** Lightweight Tiptap-JSON → Markdown serializer. Tiptap doesn't ship
 *  a markdown converter out of the box, so we walk the doc tree by
 *  hand. Covers headings, paragraphs, hard/soft breaks, bold/italic/
 *  code marks, lists, blockquotes, code blocks, and links. Anything
 *  outside this set falls through to plain text — fine for the
 *  classifier + ATS exports. */
function docToMarkdown(node: any): string {
  if (!node) return "";
  if (Array.isArray(node)) return node.map(docToMarkdown).join("");

  if (node.type === "doc") {
    return (node.content ?? []).map((n: any) => docToMarkdown(n)).join("\n\n");
  }
  if (node.type === "paragraph") {
    return docToMarkdown(node.content ?? []);
  }
  if (node.type === "heading") {
    const level = node.attrs?.level ?? 2;
    return `${"#".repeat(level)} ${docToMarkdown(node.content ?? [])}`;
  }
  if (node.type === "bulletList") {
    return (node.content ?? [])
      .map((item: any) => `- ${docToMarkdown(item.content ?? []).trim()}`)
      .join("\n");
  }
  if (node.type === "orderedList") {
    return (node.content ?? [])
      .map((item: any, i: number) => `${i + 1}. ${docToMarkdown(item.content ?? []).trim()}`)
      .join("\n");
  }
  if (node.type === "listItem") {
    return docToMarkdown(node.content ?? []);
  }
  if (node.type === "blockquote") {
    return `> ${docToMarkdown(node.content ?? [])}`;
  }
  if (node.type === "codeBlock") {
    return "```\n" + docToMarkdown(node.content ?? []) + "\n```";
  }
  if (node.type === "hardBreak") return "\n";
  if (node.type === "text") {
    let txt = String(node.text ?? "");
    for (const mark of node.marks ?? []) {
      if (mark.type === "bold") txt = `**${txt}**`;
      else if (mark.type === "italic") txt = `*${txt}*`;
      else if (mark.type === "code") txt = `\`${txt}\``;
      else if (mark.type === "link") txt = `[${txt}](${mark.attrs?.href ?? ""})`;
    }
    return txt;
  }
  // Unknown node — recurse on children, otherwise drop.
  return docToMarkdown(node.content ?? []);
}

function countWords(markdown: string): number {
  return markdown.trim().split(/\s+/).filter(Boolean).length;
}

export default function ArticleEditor({
  initialJson,
  initialMarkdown,
  placeholder = "Tell your story…",
  readOnly = false,
  onAutosave,
  onChange,
}: Props) {
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false, HTMLAttributes: { rel: "nofollow" } }),
      Placeholder.configure({ placeholder }),
    ],
    content: initialJson ?? (initialMarkdown ? initialMarkdown : undefined),
    editable: !readOnly,
    onUpdate: ({ editor }) => {
      const json = editor.getJSON();
      const markdown = docToMarkdown(json);
      const payload = { json, markdown, wordCount: countWords(markdown) };
      onChange?.(payload);
      if (!onAutosave) return;
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      autosaveTimer.current = setTimeout(() => onAutosave(payload), 3_000);
    },
  });

  useEffect(() => () => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
  }, []);

  if (!editor) return null;

  return (
    <div className="border rounded-lg overflow-hidden">
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-1 px-2 py-1 border-b bg-muted/30">
          <Button size="sm" variant="ghost" onClick={() => editor.chain().focus().toggleBold().run()} className={editor.isActive("bold") ? "bg-muted" : ""}>
            <Bold className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => editor.chain().focus().toggleItalic().run()} className={editor.isActive("italic") ? "bg-muted" : ""}>
            <Italic className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => editor.chain().focus().toggleCode().run()} className={editor.isActive("code") ? "bg-muted" : ""}>
            <Code className="w-3.5 h-3.5" />
          </Button>
          <span className="mx-1 h-4 w-px bg-border" />
          <Button size="sm" variant="ghost" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={editor.isActive("heading", { level: 2 }) ? "bg-muted" : ""}>
            <Heading2 className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={editor.isActive("heading", { level: 3 }) ? "bg-muted" : ""}>
            <Heading3 className="w-3.5 h-3.5" />
          </Button>
          <span className="mx-1 h-4 w-px bg-border" />
          <Button size="sm" variant="ghost" onClick={() => editor.chain().focus().toggleBulletList().run()} className={editor.isActive("bulletList") ? "bg-muted" : ""}>
            <List className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={editor.isActive("orderedList") ? "bg-muted" : ""}>
            <ListOrdered className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => editor.chain().focus().toggleBlockquote().run()} className={editor.isActive("blockquote") ? "bg-muted" : ""}>
            <Quote className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              const url = await promptDialog({ title: "Insert link", label: "URL", placeholder: "https://…" });
              if (url) editor.chain().focus().setLink({ href: url }).run();
              else editor.chain().focus().unsetLink().run();
            }}
            className={editor.isActive("link") ? "bg-muted" : ""}
          >
            <LinkIcon className="w-3.5 h-3.5" />
          </Button>
          <span className="mx-1 h-4 w-px bg-border" />
          <Button size="sm" variant="ghost" onClick={() => editor.chain().focus().undo().run()}>
            <Undo2 className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => editor.chain().focus().redo().run()}>
            <Redo2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}
      <EditorContent
        editor={editor}
        className="prose prose-sm max-w-none p-4 min-h-[300px] focus:outline-none"
      />
    </div>
  );
}
