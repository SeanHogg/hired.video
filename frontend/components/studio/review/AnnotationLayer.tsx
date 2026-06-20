/**
 * AnnotationLayer — the review overlay that floats over the read-only resume
 * canvas (#1947). Two interaction modes, both authored by either party:
 *
 *   • Sticky notes  — free pins on the page, stored as a `CanvasAnchor`
 *     ({ pageId, x, y }) in the SAME 0..1 fraction convention as `WidgetPosition`
 *     so they survive zoom/resize. In "place" mode a click drops a note at the
 *     clicked fraction. Anchors are immutable once created (the API exposes no
 *     anchor patch), so notes don't drag — placement is the positioning act.
 *
 *   • Highlights    — a text selection inside the canvas becomes a
 *     `ContentAnchor` (sectionKey resolved from the nearest `[data-annot-section]`
 *     ancestor the canonical renderer now emits, + the quoted text as the
 *     anchor of last resort).
 *
 * This layer is a SEPARATE plane over the resume — it is never part of the
 * document's print layout, so feedback never leaks into an export.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessageSquare, StickyNote, X } from "lucide-react";
import type {
  ResumeReviewAnnotationDTO,
  CreateAnnotationInput,
} from "@shared/resume-feedback";

interface SelectionToolbar {
  top: number;
  left: number;
  quote: string;
  sectionKey: string;
  referenceId?: string;
}

interface AnnotationLayerProps {
  /** The positioned wrapper around the rendered resume. Must be `position: relative`. */
  containerRef: React.RefObject<HTMLElement>;
  annotations: ResumeReviewAnnotationDTO[];
  /** Logical page id stamped on every canvas anchor for this surface. */
  pageId: string;
  canAnnotate: boolean;
  /** Sticky-note placement mode — a click on the canvas drops a note. */
  placing: boolean;
  onExitPlacing: () => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCreate: (input: CreateAnnotationInput) => Promise<void>;
  /** Default swatch for newly placed sticky notes. */
  newColor: string;
}

/** Walk up from a selection node to the nearest section the renderer tagged. */
function resolveSection(node: Node | null, root: HTMLElement): { sectionKey: string; referenceId?: string } {
  let el: HTMLElement | null =
    node?.nodeType === Node.ELEMENT_NODE
      ? (node as HTMLElement)
      : (node?.parentElement ?? null);
  while (el && el !== root) {
    const key = el.getAttribute("data-annot-section");
    if (key) {
      return { sectionKey: key, referenceId: el.getAttribute("data-annot-ref") ?? undefined };
    }
    el = el.parentElement;
  }
  return { sectionKey: "resume" };
}

const MAX_QUOTE = 280;

export default function AnnotationLayer({
  containerRef,
  annotations,
  pageId,
  canAnnotate,
  placing,
  onExitPlacing,
  selectedId,
  onSelect,
  onCreate,
  newColor,
}: AnnotationLayerProps) {
  const [toolbar, setToolbar] = useState<SelectionToolbar | null>(null);
  const composingRef = useRef(false);

  const canvasNotes = useMemo(
    () => annotations.filter((a) => a.anchor.type === "canvas"),
    [annotations],
  );

  // ── Text-selection → highlight toolbar ──────────────────────────────────────
  useEffect(() => {
    if (!canAnnotate) return;
    const root = containerRef.current;
    if (!root) return;

    const onMouseUp = () => {
      if (composingRef.current) return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setToolbar(null);
        return;
      }
      const range = sel.getRangeAt(0);
      if (!root.contains(range.commonAncestorContainer)) {
        setToolbar(null);
        return;
      }
      const quote = sel.toString().trim();
      if (!quote) {
        setToolbar(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      const rootRect = root.getBoundingClientRect();
      const { sectionKey, referenceId } = resolveSection(range.commonAncestorContainer, root);
      setToolbar({
        top: rect.top - rootRect.top - 40,
        left: Math.max(0, rect.left - rootRect.left + rect.width / 2 - 70),
        quote: quote.slice(0, MAX_QUOTE),
        sectionKey,
        referenceId,
      });
    };

    document.addEventListener("mouseup", onMouseUp);
    return () => document.removeEventListener("mouseup", onMouseUp);
  }, [canAnnotate, containerRef]);

  // ── Sticky-note placement ───────────────────────────────────────────────────
  const onCanvasClick = useCallback(
    async (e: React.MouseEvent) => {
      if (!placing) return;
      const root = containerRef.current;
      if (!root) return;
      const rect = root.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
      const body = window.prompt("Sticky note");
      onExitPlacing();
      if (!body?.trim()) return;
      await onCreate({
        kind: "sticky_note",
        body: body.trim(),
        color: newColor,
        anchor: { type: "canvas", pageId, x, y },
      });
    },
    [placing, containerRef, pageId, newColor, onCreate, onExitPlacing],
  );

  const startHighlight = useCallback(async () => {
    if (!toolbar) return;
    composingRef.current = true;
    const body = window.prompt(`Comment on "${toolbar.quote.slice(0, 60)}…"`);
    composingRef.current = false;
    window.getSelection()?.removeAllRanges();
    setToolbar(null);
    if (!body?.trim()) return;
    await onCreate({
      kind: "highlight",
      body: body.trim(),
      anchor: {
        type: "content",
        sectionKey: toolbar.sectionKey,
        referenceId: toolbar.referenceId,
        quote: toolbar.quote,
      },
    });
  }, [toolbar, onCreate]);

  return (
    <div
      className="absolute inset-0"
      style={{ pointerEvents: placing ? "auto" : "none", cursor: placing ? "crosshair" : "default" }}
      onClick={onCanvasClick}
    >
      {/* Placement banner */}
      {placing && (
        <div
          className="absolute left-1/2 top-2 -translate-x-1/2 z-30 rounded-full bg-amber-500 px-3 py-1 text-xs font-medium text-white shadow"
          style={{ pointerEvents: "none" }}
        >
          Click anywhere to drop a sticky note
        </div>
      )}

      {/* Sticky-note pins */}
      {canvasNotes.map((note) => {
        const a = note.anchor as Extract<ResumeReviewAnnotationDTO["anchor"], { type: "canvas" }>;
        const selected = note.id === selectedId;
        const resolved = note.status === "accepted" || note.status === "resolved";
        return (
          <button
            key={note.id}
            type="button"
            className={`absolute z-20 flex max-w-[200px] items-start gap-1 rounded-md border px-2 py-1 text-left text-xs shadow-sm transition ${
              selected ? "ring-2 ring-brand-purple" : ""
            } ${resolved ? "opacity-50" : ""}`}
            style={{
              left: `${a.x * 100}%`,
              top: `${a.y * 100}%`,
              backgroundColor: note.color ?? newColor,
              pointerEvents: "auto",
            }}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(selected ? null : note.id);
            }}
          >
            <StickyNote className="mt-0.5 h-3 w-3 shrink-0 text-slate-700" />
            <span className="line-clamp-3 text-slate-800">{note.body}</span>
          </button>
        );
      })}

      {/* Selection → highlight toolbar */}
      {toolbar && (
        <div
          className="absolute z-30 flex items-center gap-1"
          style={{ top: toolbar.top, left: toolbar.left, pointerEvents: "auto" }}
        >
          <button
            type="button"
            className="flex items-center gap-1 rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white shadow hover:bg-slate-800"
            onMouseDown={(e) => e.preventDefault()}
            onClick={startHighlight}
          >
            <MessageSquare className="h-3 w-3" /> Comment
          </button>
          <button
            type="button"
            className="rounded-md bg-slate-200 p-1 text-slate-600 shadow hover:bg-slate-300"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              window.getSelection()?.removeAllRanges();
              setToolbar(null);
            }}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Flash the first occurrence of `quote` inside `root` — used when the owner
 * clicks a content annotation in the sidebar to locate it on the page. Pure DOM
 * (TreeWalker) so it works regardless of which renderer drew the resume.
 */
export function flashQuoteInContainer(root: HTMLElement | null, quote: string): void {
  if (!root || !quote) return;
  const needle = quote.trim().slice(0, 120).toLowerCase();
  if (!needle) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = node.textContent ?? "";
    if (text.toLowerCase().includes(needle)) {
      const el = node.parentElement;
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      const prev = el.style.backgroundColor;
      el.style.transition = "background-color 0.3s";
      el.style.backgroundColor = "#fde68a";
      window.setTimeout(() => {
        el.style.backgroundColor = prev;
      }, 1400);
      return;
    }
  }
}
