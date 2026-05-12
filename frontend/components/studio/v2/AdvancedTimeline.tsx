/**
 * AdvancedTimeline — expanded multi-track view for the v2 editor.
 *
 * Renders:
 *   - A "Background" track with one block per scene, sized by duration.
 *     Drag the right edge to change scene duration.
 *   - A "Widgets" track with one block per widget, positioned by its
 *     `visibleFrom`/`visibleTo` within the scene. Drag the bar to move
 *     it; drag either edge to trim. Sceneless durations imply
 *     "visible the whole scene" (visibleFrom = null).
 *   - A playhead column (visual only — no playback engine yet).
 *
 * Operates directly on CanvasState so every mutation lands in the same
 * editor state the canvas + properties panel read from — no parallel
 * timeline state. The shell wires onSceneChange / onWidgetChange to its
 * existing mutators, so this view is just a different presentation of
 * the same source of truth (DRY rule).
 */
import { useMemo, useRef } from "react";
import type { CanvasState, Scene, Widget } from "@/lib/studio/editor-v2/canvas-state";
import { cn } from "@/lib/utils";

const TRACK_HEIGHT = 32;
const TRACK_LABEL_WIDTH = 96;
const MIN_SCENE_SECONDS = 0.5;
const MIN_WIDGET_SECONDS = 0.1;

export interface AdvancedTimelineProps {
  state: CanvasState;
  activeSceneId: string | null;
  selectedWidgetId: string | null;
  onSelectScene: (sceneId: string) => void;
  onSelectWidget: (sceneId: string, widgetId: string) => void;
  onSceneDurationChange: (sceneId: string, durationSeconds: number) => void;
  onWidgetWindowChange: (
    widgetId: string,
    visibleFrom: number | null,
    visibleTo: number | null,
  ) => void;
}

export default function AdvancedTimeline({
  state,
  activeSceneId,
  selectedWidgetId,
  onSelectScene,
  onSelectWidget,
  onSceneDurationChange,
  onWidgetWindowChange,
}: AdvancedTimelineProps) {
  const total = useMemo(
    () => state.scenes.reduce((sum, s) => sum + s.durationSeconds, 0),
    [state.scenes],
  );
  const sceneOffsets = useMemo(() => {
    const offsets: number[] = [];
    let cursor = 0;
    for (const scene of state.scenes) {
      offsets.push(cursor);
      cursor += scene.durationSeconds;
    }
    return offsets;
  }, [state.scenes]);

  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div className="flex flex-col bg-card/80">
      <Ruler total={total} containerRef={containerRef} />
      <div ref={containerRef} className="relative">
        {/* Background track */}
        <TrackRow label="Background">
          {state.scenes.map((scene, idx) => {
            const start = sceneOffsets[idx];
            return (
              <SceneBlock
                key={scene.id}
                scene={scene}
                start={start}
                total={total}
                active={scene.id === activeSceneId}
                onSelect={() => onSelectScene(scene.id)}
                onResize={(seconds) =>
                  onSceneDurationChange(scene.id, Math.max(MIN_SCENE_SECONDS, seconds))
                }
              />
            );
          })}
        </TrackRow>

        {/* Widgets track */}
        <TrackRow label="Widgets">
          {state.scenes.map((scene, idx) => {
            const start = sceneOffsets[idx];
            return scene.widgets.map((widget) => (
              <WidgetBlock
                key={widget.id}
                scene={scene}
                widget={widget}
                sceneStart={start}
                total={total}
                selected={widget.id === selectedWidgetId}
                onSelect={() => onSelectWidget(scene.id, widget.id)}
                onTrim={(from, to) => onWidgetWindowChange(widget.id, from, to)}
              />
            ));
          })}
        </TrackRow>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Ruler — second markers across the top.
// ───────────────────────────────────────────────────────────────────────────

function Ruler({
  total,
  containerRef,
}: {
  total: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const ticks = Math.max(2, Math.ceil(total));
  void containerRef;
  return (
    <div
      className="relative h-5 border-b border-border text-[9px] text-muted-foreground"
      style={{ paddingLeft: TRACK_LABEL_WIDTH }}
    >
      {Array.from({ length: ticks + 1 }, (_, i) => (
        <div
          key={i}
          className="absolute top-0 h-full"
          style={{ left: `calc(${TRACK_LABEL_WIDTH}px + ${(i / total) * 100}% - ${(TRACK_LABEL_WIDTH * i) / total}px)` }}
        >
          <span className="block translate-x-[-50%] pt-0.5">{i}s</span>
        </div>
      ))}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Track row — the label cell + the variable-width content cell. Shared
// so both tracks lay out identically.
// ───────────────────────────────────────────────────────────────────────────

function TrackRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex border-b border-border last:border-b-0" style={{ minHeight: TRACK_HEIGHT }}>
      <div
        className="flex shrink-0 items-center border-r border-border px-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
        style={{ width: TRACK_LABEL_WIDTH }}
      >
        {label}
      </div>
      <div className="relative flex-1">{children}</div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Scene block — drag the right edge to change duration.
// ───────────────────────────────────────────────────────────────────────────

function SceneBlock({
  scene,
  start,
  total,
  active,
  onSelect,
  onResize,
}: {
  scene: Scene;
  start: number;
  total: number;
  active: boolean;
  onSelect: () => void;
  onResize: (seconds: number) => void;
}) {
  const left = (start / total) * 100;
  const width = (scene.durationSeconds / total) * 100;
  const dragStart = useRef<{ pointerId: number; startX: number; startDuration: number; widthPx: number } | null>(null);

  function beginResize(e: React.PointerEvent) {
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const parent = target.parentElement?.parentElement;
    if (!parent) return;
    dragStart.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startDuration: scene.durationSeconds,
      widthPx: parent.getBoundingClientRect().width,
    };
  }
  function onMove(e: React.PointerEvent) {
    const s = dragStart.current;
    if (!s || e.pointerId !== s.pointerId) return;
    const dxSeconds = ((e.clientX - s.startX) / s.widthPx) * total;
    onResize(s.startDuration + dxSeconds);
  }
  function onEnd(e: React.PointerEvent) {
    const s = dragStart.current;
    if (!s || e.pointerId !== s.pointerId) return;
    dragStart.current = null;
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "absolute top-1 bottom-1 flex items-center overflow-hidden rounded border-2 px-2 text-[10px] font-medium transition",
        active
          ? "border-brand-purple bg-brand-purple/15 text-brand-purple"
          : "border-border bg-background hover:border-foreground/40",
      )}
      style={{ left: `${left}%`, width: `${width}%` }}
    >
      <span className="truncate">{scene.label}</span>
      <span
        onPointerDown={beginResize}
        onPointerMove={onMove}
        onPointerUp={onEnd}
        onPointerCancel={onEnd}
        className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-border/60 hover:bg-brand-purple"
        aria-label="Resize scene"
      />
    </button>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Widget block — bar positioned inside its scene's slice.
// ───────────────────────────────────────────────────────────────────────────

function WidgetBlock({
  scene,
  widget,
  sceneStart,
  total,
  selected,
  onSelect,
  onTrim,
}: {
  scene: Scene;
  widget: Widget;
  sceneStart: number;
  total: number;
  selected: boolean;
  onSelect: () => void;
  onTrim: (from: number | null, to: number | null) => void;
}) {
  const from = widget.visibleFrom ?? 0;
  const to = widget.visibleTo ?? scene.durationSeconds;
  const left = ((sceneStart + from) / total) * 100;
  const width = ((to - from) / total) * 100;

  const drag = useRef<
    | {
        pointerId: number;
        mode: "move" | "trim-start" | "trim-end";
        startX: number;
        startFrom: number;
        startTo: number;
        widthPx: number;
      }
    | null
  >(null);

  function begin(e: React.PointerEvent, mode: "move" | "trim-start" | "trim-end") {
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const trackEl = target.closest("[data-widgets-track]");
    if (!(trackEl instanceof HTMLElement)) return;
    drag.current = {
      pointerId: e.pointerId,
      mode,
      startX: e.clientX,
      startFrom: from,
      startTo: to,
      widthPx: trackEl.getBoundingClientRect().width,
    };
  }
  function move(e: React.PointerEvent) {
    const s = drag.current;
    if (!s || e.pointerId !== s.pointerId) return;
    const dxSeconds = ((e.clientX - s.startX) / s.widthPx) * total;
    let nextFrom = s.startFrom;
    let nextTo = s.startTo;
    if (s.mode === "move") {
      const len = s.startTo - s.startFrom;
      nextFrom = clamp(s.startFrom + dxSeconds, 0, scene.durationSeconds - len);
      nextTo = nextFrom + len;
    } else if (s.mode === "trim-start") {
      nextFrom = clamp(s.startFrom + dxSeconds, 0, s.startTo - MIN_WIDGET_SECONDS);
    } else {
      nextTo = clamp(s.startTo + dxSeconds, s.startFrom + MIN_WIDGET_SECONDS, scene.durationSeconds);
    }
    onTrim(nextFrom, nextTo);
  }
  function end(e: React.PointerEvent) {
    const s = drag.current;
    if (!s || e.pointerId !== s.pointerId) return;
    drag.current = null;
  }

  return (
    <div
      data-widgets-track
      role="button"
      tabIndex={0}
      onPointerDown={(e) => begin(e, "move")}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "absolute top-1 bottom-1 flex cursor-grab items-center overflow-hidden rounded border px-1.5 text-[10px] transition",
        selected
          ? "border-brand-purple bg-brand-purple/20"
          : "border-cyan-500/40 bg-cyan-500/15 hover:border-cyan-500",
      )}
      style={{ left: `${left}%`, width: `${width}%` }}
    >
      <span
        onPointerDown={(e) => begin(e, "trim-start")}
        onPointerMove={move}
        onPointerUp={end}
        className="absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-brand-purple"
        aria-label="Trim start"
      />
      <span className="truncate">{labelFor(widget)}</span>
      <span
        onPointerDown={(e) => begin(e, "trim-end")}
        onPointerMove={move}
        onPointerUp={end}
        className="absolute right-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-brand-purple"
        aria-label="Trim end"
      />
    </div>
  );
}

function labelFor(widget: Widget): string {
  switch (widget.params.kind) {
    case "text":
    case "heading":
      return widget.params.data.text.slice(0, 24) || widget.kind;
    case "image":
      return "Image";
    case "video":
      return "Video";
    case "shape-rect":
      return "Rect";
    case "shape-circle":
      return "Circle";
    case "divider":
      return "Divider";
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
