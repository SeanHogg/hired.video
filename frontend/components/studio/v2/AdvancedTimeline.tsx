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
 *   - An "Audio" track with bars for music + voiceovers — drag to
 *     move, trim, or fade (#1115).
 *
 * Operates directly on CanvasState so every mutation lands in the same
 * editor state the canvas + properties panel read from — no parallel
 * timeline state. The shell wires onSceneChange / onWidgetChange to its
 * existing mutators, so this view is just a different presentation of
 * the same source of truth (DRY rule).
 */
import { useMemo, useRef } from "react";
import type { CanvasState, Scene, VoiceoverClip, Widget } from "@/lib/studio/editor-v2/canvas-state";
import type { MusicSource } from "@/lib/studio/music-catalog";
import { findMusicTrack } from "@/lib/studio/music-catalog";
import AudioBar, { type AudioBarValue } from "./AudioBar";
import { cn } from "@/lib/utils";

const TRACK_HEIGHT = 32;
const TRACK_LABEL_WIDTH = 96;
const MIN_SCENE_SECONDS = 0.5;
const MIN_WIDGET_SECONDS = 0.1;

/** Audio-bar selection — kind discriminator so the host's "selected
 *  bar" state can be a single union instead of a per-source boolean. */
export type AudioSelection =
  | { kind: "music" }
  | { kind: "voiceover"; id: string };

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
  /** Audio-track props — optional so the timeline can mount without
   *  the audio row on kinds that don't carry audio (image/cad/etc.).
   *  When `onVoiceoverChange` OR `onMusicChange` is provided, the
   *  audio row renders + per-source drags route through them. */
  selectedAudio?: AudioSelection | null;
  onSelectAudio?: (selection: AudioSelection) => void;
  onVoiceoverChange?: (voiceoverId: string, patch: AudioPatch) => void;
  onMusicChange?: (patch: AudioPatch) => void;
  /** Fires once on pointer-up of any audio-bar drag — host commits
   *  history here so a multi-tick drag becomes one undo step. */
  onAudioCommit?: () => void;
}

/** Audio-clip timing patch — what an AudioBar drag emits. Both
 *  voiceover + music clips accept the same field set; per-source
 *  callbacks decide which mutators to call. */
export interface AudioPatch {
  startOffsetSec?: number;
  trimStartSec?: number;
  trimEndSec?: number;
  fadeInSec?: number;
  fadeOutSec?: number;
}

export default function AdvancedTimeline({
  state,
  activeSceneId,
  selectedWidgetId,
  onSelectScene,
  onSelectWidget,
  onSceneDurationChange,
  onWidgetWindowChange,
  selectedAudio,
  onSelectAudio,
  onVoiceoverChange,
  onMusicChange,
  onAudioCommit,
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

        {/* Audio track — voiceovers + music (#1115). Self-gates: only
            renders when the host wired audio handlers. Music bars use
            an amber accent; voiceover bars use violet so the rows are
            visually distinct. */}
        {(onVoiceoverChange || onMusicChange) && (
          <TrackRow label="Audio">
            <div data-audio-track className="absolute inset-0">
              {state.musicSource && onMusicChange && (
                <AudioBar
                  value={musicBarValue(state.musicSource, total)}
                  totalSeconds={total}
                  label={musicLabel(state.musicSource)}
                  selected={selectedAudio?.kind === "music"}
                  accentClass="border-amber-500/40 bg-amber-500/15 hover:border-amber-500"
                  onChange={(next) =>
                    onMusicChange(barValueToPatch(next, /* anchorStart */ 0))
                  }
                  onCommit={() => onAudioCommit?.()}
                  onSelect={() => onSelectAudio?.({ kind: "music" })}
                />
              )}
              {onVoiceoverChange && state.voiceovers.map((vo) => {
                const anchorStart = resolveAnchorStart(vo, state.scenes, sceneOffsets);
                return (
                  <AudioBar
                    key={vo.id}
                    value={voiceoverBarValue(vo, anchorStart)}
                    totalSeconds={total}
                    label={vo.label || "Voiceover"}
                    selected={selectedAudio?.kind === "voiceover" && selectedAudio.id === vo.id}
                    accentClass="border-violet-500/40 bg-violet-500/15 hover:border-violet-500"
                    onChange={(next) =>
                      onVoiceoverChange(vo.id, barValueToPatch(next, anchorStart))
                    }
                    onCommit={() => onAudioCommit?.()}
                    onSelect={() => onSelectAudio?.({ kind: "voiceover", id: vo.id })}
                  />
                );
              })}
            </div>
          </TrackRow>
        )}
      </div>
    </div>
  );
}

// ─── Audio-bar helpers ─────────────────────────────────────────────────────
// Pure functions that translate between CanvasState's per-clip shape +
// the AudioBar's flat timing snapshot. Per the DRY rule the math lives
// in ONE place: both the voiceover + music paths route through the
// same translation so the bar component stays kind-agnostic.

/** Resolve a voiceover's anchor scene start in composition time. Null
 *  anchor + missing scene both resolve to 0. Pure — exported for the
 *  bar-snapshot translator above. */
function resolveAnchorStart(
  vo: VoiceoverClip,
  scenes: Scene[],
  sceneOffsets: number[],
): number {
  if (!vo.anchorSceneId) return 0;
  const idx = scenes.findIndex((s) => s.id === vo.anchorSceneId);
  return idx >= 0 ? sceneOffsets[idx] : 0;
}

function voiceoverBarValue(
  vo: VoiceoverClip,
  anchorStart: number,
): AudioBarValue {
  const offset = vo.startOffsetSec ?? 0;
  const trimStart = vo.trimStartSec ?? 0;
  const trimEnd = vo.trimEndSec ?? 0;
  const playable = Math.max(0.05, vo.durationSeconds - trimStart - trimEnd);
  return {
    startSec: anchorStart + offset,
    endSec: anchorStart + offset + playable,
    trimStartSec: trimStart,
    trimEndSec: trimEnd,
    fadeInSec: vo.fadeInSec ?? 0,
    fadeOutSec: vo.fadeOutSec ?? 0,
    sourceDurationSec: vo.durationSeconds,
  };
}

function musicBarValue(source: MusicSource, total: number): AudioBarValue {
  const offset = source.startOffsetSec ?? 0;
  // Music can be either custom (carries `durationSeconds`) or stock
  // (procedurally generated — duration matches the composition by
  // design, so we use `total` as the source duration). Either way the
  // bar's `sourceDurationSec` is the cap on trim drags.
  const sourceDur = source.kind === "custom" ? source.durationSeconds : total;
  return {
    startSec: offset,
    endSec: Math.min(total, offset + sourceDur),
    trimStartSec: 0,
    trimEndSec: 0,
    fadeInSec: source.fadeInSec ?? 0,
    fadeOutSec: source.fadeOutSec ?? 0,
    sourceDurationSec: sourceDur,
  };
}

function musicLabel(source: MusicSource): string {
  if (source.kind === "custom") return source.label || "Music";
  const track = findMusicTrack(source.trackId);
  return track?.label ?? "Music";
}

/** Translate a bar value to the absolute patch the model wants. The
 *  bar emits composition-time `startSec`; the model stores
 *  `startOffsetSec` relative to the anchor, so we subtract anchor.
 *  Music passes anchor = 0 (no anchor; absolute timeline position). */
function barValueToPatch(next: AudioBarValue, anchorStart: number): AudioPatch {
  return {
    startOffsetSec: next.startSec - anchorStart,
    trimStartSec: next.trimStartSec,
    trimEndSec: next.trimEndSec,
    fadeInSec: next.fadeInSec,
    fadeOutSec: next.fadeOutSec,
  };
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
