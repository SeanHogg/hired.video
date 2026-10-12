/**
 * `<ComicReader>` — dedicated reader UI for `mediaKind: "comic"`
 * projects (closes the reader half of #939's Phase 2). Vertical-
 * scroll page reveal with snap-to-page; the same `<CanvasStage>` the
 * editor uses renders each page in playback mode so author + reader
 * surfaces can never drift on widget rendering.
 *
 * Per the canvas-runtime extensibility model (PRD §1.2), every kind
 * owns its own consumer-side viewer. Comic Phase 1 fell back to the
 * shared `<StudioVideoSurface>` (which rendered the project as a tiny
 * video-shaped player) — that worked but read as "Video with no
 * controls" rather than "comic". This reader is the kind-native
 * experience: vertical scroll, tap-to-advance on mobile, large
 * page-by-page reveal.
 *
 * Mounted by `<ProjectPlayer>`'s comic branch (when the consumer-side
 * mediaKind dispatch from #937 lands). For now, callers can import
 * directly and pass the CanvasState themselves.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { CanvasState, Scene } from "@/lib/studio/editor-v2/canvas-state";
import CanvasStage from "@/components/studio/v2/CanvasStage";
import { cn } from "@/lib/utils";

export interface ComicReaderProps {
  state: CanvasState;
  /** Optional className applied to the outer scroll container. */
  className?: string;
  /** When true, the reader auto-snaps to the next page after `autoAdvanceMs`.
   *  Useful for kiosk / share-link contexts; defaults to false. */
  autoAdvance?: boolean;
  /** Milliseconds between auto-advance ticks. Defaults to 4000. */
  autoAdvanceMs?: number;
}

export default function ComicReader({
  state,
  className,
  autoAdvance = false,
  autoAdvanceMs = 4000,
}: ComicReaderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  const pages = useMemo<Scene[]>(() => state.scenes, [state.scenes]);

  // Track which page is centred in the viewport — IntersectionObserver
  // is the canonical pattern for "what's currently visible?" and lets
  // mobile users scroll naturally without us hijacking the wheel.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new IntersectionObserver(
      (entries) => {
        // Most-visible wins — entries can fire while two pages are
        // partly on-screen during a scroll.
        let best: { idx: number; ratio: number } | null = null;
        for (const entry of entries) {
          const idx = pageRefs.current.findIndex((el) => el === entry.target);
          if (idx === -1) continue;
          if (!best || entry.intersectionRatio > best.ratio) {
            best = { idx, ratio: entry.intersectionRatio };
          }
        }
        if (best && best.ratio > 0.5) setActiveIndex(best.idx);
      },
      { root: container, threshold: [0.25, 0.5, 0.75, 1] },
    );
    for (const el of pageRefs.current) {
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [pages.length]);

  const goTo = useCallback((idx: number) => {
    const clamped = Math.max(0, Math.min(pages.length - 1, idx));
    const el = pageRefs.current[clamped];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveIndex(clamped);
  }, [pages.length]);

  // Auto-advance — fire-and-forget interval that scrolls to the next
  // page. Stops at the last page so it doesn't loop forever.
  useEffect(() => {
    if (!autoAdvance) return;
    const handle = setInterval(() => {
      setActiveIndex((idx) => {
        const next = idx + 1;
        if (next >= pages.length) return idx;
        const el = pageRefs.current[next];
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        return next;
      });
    }, autoAdvanceMs);
    return () => clearInterval(handle);
  }, [autoAdvance, autoAdvanceMs, pages.length]);

  // Keyboard navigation — arrow keys + space — when the reader has
  // focus. Self-gates so it doesn't fight other handlers on the page.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowDown" || e.key === " " || e.key === "PageDown") {
        e.preventDefault();
        goTo(activeIndex + 1);
      } else if (e.key === "ArrowUp" || e.key === "PageUp") {
        e.preventDefault();
        goTo(activeIndex - 1);
      } else if (e.key === "Home") {
        e.preventDefault();
        goTo(0);
      } else if (e.key === "End") {
        e.preventDefault();
        goTo(pages.length - 1);
      }
    }
    container.addEventListener("keydown", onKey);
    return () => container.removeEventListener("keydown", onKey);
  }, [activeIndex, goTo, pages.length]);

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className={cn(
        "relative h-full w-full overflow-y-auto bg-ink outline-none snap-y snap-mandatory",
        className,
      )}
      aria-label="Comic reader"
    >
      {pages.map((scene, idx) => (
        <div
          key={scene.id}
          ref={(el) => {
            pageRefs.current[idx] = el;
          }}
          className="relative flex h-full w-full snap-start items-center justify-center py-6"
          aria-label={`Page ${idx + 1} of ${pages.length}`}
        >
          {/* Render the scene via the editor's `<CanvasStage>` in
              playback mode — same widget renderer; same pixels. */}
          <div className="relative max-h-full w-auto" style={{ aspectRatio: `${state.width} / ${state.height}` }}>
            <CanvasStage
              scene={scene}
              canvasWidth={state.width}
              canvasHeight={state.height}
              zoom={1}
              mode="playback"
              currentTimeSec={0}
              selection={{ kind: "scene", sceneId: scene.id }}
            />
          </div>
        </div>
      ))}

      {/* Chrome — page indicator + prev/next arrows. Self-positioned
          over the content; the inner stage is unaware of them. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 flex items-center justify-center gap-3 text-white">
        <button
          type="button"
          onClick={() => goTo(activeIndex - 1)}
          disabled={activeIndex === 0}
          className="pointer-events-auto rounded-full bg-white/10 p-2 backdrop-blur transition hover:bg-white/20 disabled:opacity-30"
          aria-label="Previous page"
        >
          <ChevronUp className="h-4 w-4" />
        </button>
        <span className="pointer-events-auto rounded-full bg-black/60 px-3 py-1 text-xs font-medium backdrop-blur">
          {activeIndex + 1} / {pages.length}
        </span>
        <button
          type="button"
          onClick={() => goTo(activeIndex + 1)}
          disabled={activeIndex >= pages.length - 1}
          className="pointer-events-auto rounded-full bg-white/10 p-2 backdrop-blur transition hover:bg-white/20 disabled:opacity-30"
          aria-label="Next page"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
