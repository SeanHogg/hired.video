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
import { useTranslation } from "react-i18next";
import { MessageSquare, StickyNote, X } from "lucide-react";
import type {
  ResumeReviewAnnotationDTO,
  CreateAnnotationInput,
} from "@shared/resume-feedback";
import type { ResumeContent } from "@shared/resume";
import { suggestTargetFor, type SuggestTarget } from "@/lib/review-feedback/suggested-edit";
import AnnotationComposer, { type ComposerSubmit } from "./AnnotationComposer";

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
  /** The reviewed résumé's content — lets a highlight carry a structured
   *  "suggest a replacement" edit (#2220). Absent: comments only. */
  content?: unknown;
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

/** Content anchor seed captured from a text selection. */
interface ContentSeed {
  sectionKey: string;
  referenceId?: string;
  quote: string;
}

/** An open inline composer — either dropping a sticky note at a canvas point or
 *  commenting on a selected quote. Positioned in container-local px. */
interface Composer {
  mode: "sticky" | "highlight";
  left: number;
  top: number;
  canvas?: { x: number; y: number };
  content?: ContentSeed;
  /** Where the quote sits in the résumé, when a replacement can be suggested. */
  suggest?: SuggestTarget | null;
}

interface HighlightMark {
  id: string;
  color: string;
  selected: boolean;
  rects: { left: number; top: number; width: number; height: number }[];
}

/** First Range inside `root` whose text contains `quote` (within a single text
 *  node — covers the common case; multi-node quotes are skipped). Powers the
 *  persistent highlight marks. */
function findQuoteRange(root: HTMLElement, quote: string): Range | null {
  const needle = quote.trim().toLowerCase();
  if (!needle) return null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = node.textContent ?? "";
    const idx = text.toLowerCase().indexOf(needle);
    if (idx >= 0) {
      const range = document.createRange();
      range.setStart(node, idx);
      range.setEnd(node, idx + quote.trim().length);
      return range;
    }
  }
  return null;
}

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
  content,
}: AnnotationLayerProps) {
  const { t } = useTranslation();
  const [toolbar, setToolbar] = useState<SelectionToolbar | null>(null);
  const [composer, setComposer] = useState<Composer | null>(null);
  const [marks, setMarks] = useState<HighlightMark[]>([]);
  const composingRef = useRef(false);

  const canvasNotes = useMemo(
    () => annotations.filter((a) => a.anchor.type === "canvas"),
    [annotations],
  );

  // ── Persistent highlight marks ──────────────────────────────────────────────
  // Draw translucent overlays over each content annotation's quoted text. Pure
  // overlay (pointer-events: none) so it never mutates the resume DOM or blocks
  // selection; recomputed on annotation change + resize.
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const compute = () => {
      const rootRect = root.getBoundingClientRect();
      const next: HighlightMark[] = [];
      for (const a of annotations) {
        if (a.anchor.type !== "content" || !a.anchor.quote) continue;
        if (a.status === "dismissed") continue;
        const range = findQuoteRange(root, a.anchor.quote);
        if (!range) continue;
        const rects = Array.from(range.getClientRects()).map((r) => ({
          left: r.left - rootRect.left,
          top: r.top - rootRect.top,
          width: r.width,
          height: r.height,
        }));
        if (rects.length === 0) continue;
        next.push({ id: a.id, color: a.color ?? "#fde68a", selected: a.id === selectedId, rects });
      }
      setMarks(next);
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, [annotations, containerRef, selectedId]);

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

  const openComposer = useCallback((next: Composer) => {
    composingRef.current = true;
    setComposer(next);
  }, []);

  const closeComposer = useCallback(() => {
    composingRef.current = false;
    setComposer(null);
    window.getSelection()?.removeAllRanges();
  }, []);

  // ── Sticky-note placement → inline composer ─────────────────────────────────
  const onCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      if (!placing) return;
      const root = containerRef.current;
      if (!root) return;
      const rect = root.getBoundingClientRect();
      const localX = e.clientX - rect.left;
      const localY = e.clientY - rect.top;
      onExitPlacing();
      openComposer({
        mode: "sticky",
        left: Math.min(localX, rect.width - 240),
        top: localY,
        canvas: {
          x: Math.min(1, Math.max(0, localX / rect.width)),
          y: Math.min(1, Math.max(0, localY / rect.height)),
        },
      });
    },
    [placing, containerRef, onExitPlacing, openComposer],
  );

  const startHighlight = useCallback(() => {
    if (!toolbar) return;
    openComposer({
      mode: "highlight",
      left: toolbar.left,
      top: toolbar.top + 44,
      content: { sectionKey: toolbar.sectionKey, referenceId: toolbar.referenceId, quote: toolbar.quote },
      suggest: suggestTargetFor(content as ResumeContent | undefined, toolbar.quote),
    });
    setToolbar(null);
  }, [toolbar, openComposer, content]);

  const submitComposer = useCallback(
    async ({ body, suggestedEdit }: ComposerSubmit) => {
      if (!composer) return;
      let input: CreateAnnotationInput | null = null;
      if (composer.mode === "sticky" && composer.canvas) {
        const { x, y } = composer.canvas;
        input = { kind: "sticky_note", body, color: newColor, anchor: { type: "canvas", pageId, x, y } };
      } else if (composer.mode === "highlight" && composer.content) {
        // A suggestion anchors to the field it edits (#2220).
        const { quote } = composer.content;
        const sectionKey = suggestedEdit?.sectionKey ?? composer.content.sectionKey;
        const referenceId = suggestedEdit ? suggestedEdit.referenceId : composer.content.referenceId;
        input = {
          kind: "highlight",
          body,
          anchor: { type: "content", sectionKey, referenceId, quote, ...(suggestedEdit ? { fieldPath: suggestedEdit.fieldPath } : {}) },
          ...(suggestedEdit ? { suggestedEdit } : {}),
        };
      }
      closeComposer();
      if (input) await onCreate(input);
    },
    [composer, newColor, pageId, onCreate, closeComposer],
  );

  return (
    <div
      className="absolute inset-0"
      style={{
        pointerEvents: placing || composer ? "auto" : "none",
        cursor: placing ? "crosshair" : "default",
      }}
      onClick={onCanvasClick}
    >
      {/* Persistent highlight marks (visual only) */}
      {marks.map((m) =>
        m.rects.map((r, i) => (
          <div
            key={`${m.id}-${i}`}
            className="absolute rounded-sm"
            style={{
              left: r.left,
              top: r.top,
              width: r.width,
              height: r.height,
              backgroundColor: m.color,
              opacity: m.selected ? 0.55 : 0.3,
              outline: m.selected ? "1px solid rgba(124,58,237,0.7)" : "none",
              pointerEvents: "none",
              zIndex: 10,
            }}
          />
        )),
      )}

      {/* Placement banner */}
      {placing && (
        <div
          className="absolute left-1/2 top-2 -translate-x-1/2 z-30 rounded-full bg-amber-500 px-3 py-1 text-xs font-medium text-white shadow"
          style={{ pointerEvents: "none" }}
        >
          {t("review.composer.placeHint")}
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
              selected ? "ring-2 ring-brand-primary" : ""
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
            <StickyNote className="mt-0.5 h-3 w-3 shrink-0 text-foreground/80" />
            <span className="line-clamp-3 text-foreground">{note.body}</span>
          </button>
        );
      })}

      {/* Selection → highlight toolbar */}
      {toolbar && !composer && (
        <div
          className="absolute z-30 flex items-center gap-1"
          style={{ top: toolbar.top, left: toolbar.left, pointerEvents: "auto" }}
        >
          <button
            type="button"
            className="flex items-center gap-1 rounded-md bg-ink px-2 py-1 text-xs font-medium text-white shadow hover:bg-ink"
            onMouseDown={(e) => e.preventDefault()}
            onClick={startHighlight}
          >
            <MessageSquare className="h-3 w-3" /> {t("review.composer.commentAction")}
          </button>
          <button
            type="button"
            className="rounded-md bg-muted p-1 text-muted-foreground shadow hover:bg-slate-300"
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

      {/* Inline composer (replaces the old window.prompt) */}
      {composer && (
        <AnnotationComposer
          key={`${composer.mode}:${composer.left}:${composer.top}:${composer.content?.quote ?? ""}`}
          mode={composer.mode}
          left={composer.left}
          top={composer.top}
          quote={composer.content?.quote}
          suggest={composer.suggest}
          onSubmit={(out) => void submitComposer(out)}
          onCancel={closeComposer}
        />
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
