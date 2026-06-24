/**
 * Timeline — the v2 editor's single, always-on multi-track timeline.
 *
 * There is no longer a "basic strip" vs "advanced view" split. This ONE
 * component renders both states:
 *   - collapsed (minimal, default): the scene strip (Background track) +
 *     a compact audio summary so the user sees their layers at a glance.
 *   - expanded: the full multi-track view — a ruler, Background, Widgets,
 *     and ONE row per audio layer (Music 1, Music 2, Voiceover, SFX…),
 *     each independently movable / trimmable / fadeable / splittable.
 *
 * Audio is the unified `state.audioLayers[]` model — there can be MANY
 * music layers. The user drags a music track onto the timeline to add
 * another layer, scrubs the ruler to place the playhead, and splits the
 * selected layer at the playhead.
 *
 * Operates directly on CanvasState so every mutation lands in the same
 * editor state the canvas + properties panel read from — no parallel
 * timeline state (DRY).
 */
import { useMemo, useRef, useState } from "react";
import { Scissors, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  type AudioLayer,
  audioLaneForKind,
  type CanvasState,
  layerPlayableSeconds,
  type Scene,
  type Widget,
} from "@/lib/studio/editor-v2/canvas-state";
import {
  type DragPayload,
  hasRecognisedPayload,
  readDragPayload,
} from "@/lib/studio/editor-v2/drag-protocol";
import AudioBar, { type AudioBarValue } from "./AudioBar";
import { cn } from "@/lib/utils";

const TRACK_HEIGHT = 32;
const TRACK_LABEL_WIDTH = 96;
const MIN_SCENE_SECONDS = 0.5;
const MIN_WIDGET_SECONDS = 0.1;

/** Per-track accent classes keyed by audio layer kind. */
const KIND_ACCENT: Record<AudioLayer["kind"], string> = {
  music: "border-amber-500/40 bg-amber-500/15 hover:border-amber-500",
  voiceover: "border-violet-500/40 bg-violet-500/15 hover:border-violet-500",
  sfx: "border-emerald-500/40 bg-emerald-500/15 hover:border-emerald-500",
};

/** Audio-clip timing patch — what an AudioBar drag emits, mapped to the
 *  `updateAudioLayer` mutator fields by the host. */
export interface AudioPatch {
  startOffsetSec?: number;
  trimStartSec?: number;
  trimEndSec?: number;
  fadeInSec?: number;
  fadeOutSec?: number;
}

export interface AdvancedTimelineProps {
  state: CanvasState;
  /** When true, render the full multi-track view; when false, the compact
   *  collapsed summary. */
  expanded: boolean;
  activeSceneId: string | null;
  selectedWidgetId: string | null;
  selectedAudioLayerId: string | null;
  onSelectScene: (sceneId: string) => void;
  onSelectWidget: (sceneId: string, widgetId: string) => void;
  onSceneDurationChange: (sceneId: string, durationSeconds: number) => void;
  onWidgetWindowChange: (
    widgetId: string,
    visibleFrom: number | null,
    visibleTo: number | null,
  ) => void;
  onSelectAudioLayer: (layerId: string) => void;
  onAudioLayerChange: (layerId: string, patch: AudioPatch) => void;
  /** Fires once on pointer-up of any audio-bar drag — host commits
   *  history here so a multi-tick drag becomes one undo step. */
  onAudioCommit: () => void;
  /** Split the layer at a composition-time second (the playhead). */
  onSplitAudioLayer: (layerId: string, atCompositionSec: number) => void;
  onRemoveAudioLayer: (layerId: string) => void;
  /** A music track was dragged onto the timeline — add it as a new music
   *  layer. */
  onMusicDrop: (payload: DragPayload) => void;
  /** Composition-time playhead (seconds) from the shared preview clock.
   *  Drives the marker AND the split-at-playhead cut point so the
   *  timeline and the preview player share ONE playhead. */
  playheadSec: number;
  /** Seek the shared preview clock — clicking the ruler scrubs playback. */
  onSeek: (sec: number) => void;
}

export default function AdvancedTimeline({
  state,
  expanded,
  activeSceneId,
  selectedWidgetId,
  selectedAudioLayerId,
  onSelectScene,
  onSelectWidget,
  onSceneDurationChange,
  onWidgetWindowChange,
  onSelectAudioLayer,
  onAudioLayerChange,
  onAudioCommit,
  onSplitAudioLayer,
  onRemoveAudioLayer,
  onMusicDrop,
  playheadSec,
  onSeek,
}: AdvancedTimelineProps) {
  const { t } = useTranslation();
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
  const [musicDragOver, setMusicDragOver] = useState(false);

  // Per-kind running index so rows read "Music 1 / Music 2 / Voiceover".
  const kindCounts: Record<AudioLayer["kind"], number> = {
    music: 0,
    voiceover: 0,
    sfx: 0,
  };
  const layerRows = state.audioLayers.map((layer) => {
    kindCounts[layer.kind] += 1;
    return { layer, index: kindCounts[layer.kind] };
  });
  const kindLabel = (layer: AudioLayer, index: number): string => {
    const base =
      layer.kind === "music"
        ? t("studio.timeline.musicLayer", { n: index })
        : layer.kind === "voiceover"
          ? t("studio.timeline.voiceoverLayer", { n: index })
          : t("studio.timeline.sfxLayer", { n: index });
    return layer.label || base;
  };

  function handleMusicDrop(e: React.DragEvent<HTMLDivElement>) {
    setMusicDragOver(false);
    const payload = readDragPayload(e.dataTransfer);
    if (!payload || payload.kind !== "music") return;
    e.preventDefault();
    onMusicDrop(payload);
  }
  function handleMusicDragOver(e: React.DragEvent<HTMLDivElement>) {
    if (!hasRecognisedPayload(e.dataTransfer)) return;
    e.preventDefault();
    setMusicDragOver(true);
  }

  return (
    <div className="flex flex-col bg-card/80">
      {expanded && <Ruler total={total} onScrub={onSeek} />}
      <div ref={containerRef} className="relative">
        {/* Background track — scene strip. Always shown (collapsed + expanded). */}
        <TrackRow label={t("studio.timeline.background")}>
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

        {expanded && (
          /* Widgets track — only in the expanded view. */
          <TrackRow label={t("studio.timeline.widgets")}>
            <div data-widgets-track className="absolute inset-0">
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
            </div>
          </TrackRow>
        )}

        {/* Audio — a drop target for music tracks + (expanded) one row per
            layer. Collapsed shows a single compact summary row. */}
        <div
          onDrop={handleMusicDrop}
          onDragOver={handleMusicDragOver}
          onDragLeave={() => setMusicDragOver(false)}
          className={cn(musicDragOver && "ring-2 ring-amber-500/60")}
        >
          {expanded ? (
            layerRows.length > 0 ? (
              layerRows.map(({ layer, index }) => (
                <AudioLayerRow
                  key={layer.id}
                  layer={layer}
                  label={kindLabel(layer, index)}
                  total={total}
                  anchorStart={resolveAnchorStart(layer, state.scenes, sceneOffsets)}
                  selected={layer.id === selectedAudioLayerId}
                  onSelect={() => onSelectAudioLayer(layer.id)}
                  onChange={(patch) => onAudioLayerChange(layer.id, patch)}
                  onCommit={onAudioCommit}
                  onSplit={() => onSplitAudioLayer(layer.id, playheadSec)}
                  onRemove={() => onRemoveAudioLayer(layer.id)}
                  splitLabel={t("studio.timeline.split")}
                  removeLabel={t("studio.timeline.removeLayer")}
                />
              ))
            ) : (
              <TrackRow label={t("studio.timeline.audio")}>
                <div className="flex h-full items-center px-2 text-[10px] text-muted-foreground">
                  {t("studio.timeline.dropMusicHint")}
                </div>
              </TrackRow>
            )
          ) : (
            <CollapsedAudioSummary layers={state.audioLayers} kindLabel={kindLabel} />
          )}
        </div>

        {/* Playhead marker — expanded only. Reflects the shared preview
            clock; the split op cuts here. */}
        {expanded && total > 0 && (
          <div
            className="pointer-events-none absolute top-0 bottom-0 w-px bg-brand-purple"
            style={{
              left: `calc(${TRACK_LABEL_WIDTH}px + ${(playheadSec / total) * 100}% - ${(TRACK_LABEL_WIDTH * playheadSec) / total}px)`,
            }}
          />
        )}
      </div>
    </div>
  );
}

// ─── Audio layer row ────────────────────────────────────────────────────────

function AudioLayerRow({
  layer,
  label,
  total,
  anchorStart,
  selected,
  onSelect,
  onChange,
  onCommit,
  onSplit,
  onRemove,
  splitLabel,
  removeLabel,
}: {
  layer: AudioLayer;
  label: string;
  total: number;
  anchorStart: number;
  selected: boolean;
  onSelect: () => void;
  onChange: (patch: AudioPatch) => void;
  onCommit: () => void;
  onSplit: () => void;
  onRemove: () => void;
  splitLabel: string;
  removeLabel: string;
}) {
  return (
    <div className="flex border-b border-border last:border-b-0" style={{ minHeight: TRACK_HEIGHT }}>
      <div
        className="flex shrink-0 items-center gap-1 border-r border-border px-2 text-[10px] font-semibold text-muted-foreground"
        style={{ width: TRACK_LABEL_WIDTH }}
      >
        <span className="truncate uppercase tracking-wide">{label}</span>
        {selected && (
          <span className="ml-auto flex items-center gap-0.5">
            <button
              type="button"
              onClick={onSplit}
              aria-label={splitLabel}
              title={splitLabel}
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Scissors className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={onRemove}
              aria-label={removeLabel}
              title={removeLabel}
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </span>
        )}
      </div>
      <div data-audio-track className="relative flex-1">
        <AudioBar
          value={layerBarValue(layer, anchorStart)}
          totalSeconds={total}
          label={label}
          selected={selected}
          accentClass={KIND_ACCENT[layer.kind]}
          onChange={(next) => onChange(barValueToPatch(next, anchorStart))}
          onCommit={onCommit}
          onSelect={onSelect}
        />
      </div>
    </div>
  );
}

/** Compact collapsed audio summary — one thin chip per layer so the user
 *  sees their layers without the full multi-row view. */
function CollapsedAudioSummary({
  layers,
  kindLabel,
}: {
  layers: AudioLayer[];
  kindLabel: (layer: AudioLayer, index: number) => string;
}) {
  if (layers.length === 0) return null;
  const kindCounts: Record<AudioLayer["kind"], number> = { music: 0, voiceover: 0, sfx: 0 };
  return (
    <div className="flex flex-wrap items-center gap-1 px-2 py-1.5">
      {layers.map((layer) => {
        kindCounts[layer.kind] += 1;
        return (
          <span
            key={layer.id}
            className={cn(
              "flex h-6 items-center rounded border px-2 text-[10px] font-medium",
              KIND_ACCENT[layer.kind],
            )}
          >
            <span className="truncate">{kindLabel(layer, kindCounts[layer.kind])}</span>
          </span>
        );
      })}
    </div>
  );
}

// ─── Audio-bar timing translation ────────────────────────────────────────────
// Pure functions that map between an AudioLayer's stored fields and the
// AudioBar's flat composition-time snapshot. The math lives in ONE place
// so every layer kind routes through the same translation.

function resolveAnchorStart(
  layer: AudioLayer,
  scenes: Scene[],
  sceneOffsets: number[],
): number {
  if (!layer.anchorSceneId) return 0;
  const idx = scenes.findIndex((s) => s.id === layer.anchorSceneId);
  return idx >= 0 ? sceneOffsets[idx] : 0;
}

function layerBarValue(layer: AudioLayer, anchorStart: number): AudioBarValue {
  const start = anchorStart + layer.startOffsetSec;
  const playable = layerPlayableSeconds(layer);
  return {
    startSec: start,
    endSec: start + playable,
    trimStartSec: layer.trimStartSec,
    trimEndSec: layer.trimEndSec,
    fadeInSec: layer.fadeInSec,
    fadeOutSec: layer.fadeOutSec,
    // Stock music has no fixed source length (it fits the comp); treat its
    // source as effectively unbounded so trim-end can extend it. Custom
    // layers cap at their real source duration.
    sourceDurationSec:
      layer.source.kind === "stock" && layer.durationSeconds <= 0
        ? Number.MAX_SAFE_INTEGER
        : layer.durationSeconds,
  };
}

/** Translate a bar value back to the absolute patch the model wants. The
 *  bar emits composition-time `startSec`; the model stores `startOffsetSec`
 *  relative to the anchor, so we subtract the anchor. */
function barValueToPatch(next: AudioBarValue, anchorStart: number): AudioPatch {
  return {
    startOffsetSec: next.startSec - anchorStart,
    trimStartSec: next.trimStartSec,
    trimEndSec: next.trimEndSec,
    fadeInSec: next.fadeInSec,
    fadeOutSec: next.fadeOutSec,
  };
}

// ─── Ruler ───────────────────────────────────────────────────────────────────

function Ruler({ total, onScrub }: { total: number; onScrub: (sec: number) => void }) {
  const ticks = Math.max(2, Math.ceil(total));
  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - TRACK_LABEL_WIDTH;
    const usable = rect.width - TRACK_LABEL_WIDTH;
    if (usable <= 0) return;
    onScrub(Math.max(0, Math.min(total, (x / usable) * total)));
  }
  return (
    <div
      className="relative h-5 cursor-text border-b border-border text-[9px] text-muted-foreground"
      style={{ paddingLeft: TRACK_LABEL_WIDTH }}
      onClick={handleClick}
      role="presentation"
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

// ─── Track row + scene / widget blocks (unchanged from prior view) ───────────

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
    default:
      return widget.kind;
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
