/**
 * TimelineCanvas — frame-accurate multi-track display + transport.
 *
 * Dumb renderer of a Timeline JSON. Owns no editor state besides the
 * current zoom level (px-per-frame) and hover/selection — everything
 * else (the timeline itself, the playhead frame, sources) flows from
 * props. Mutations bubble back up via `onTimelineChange`. This keeps
 * the canvas reusable for any consumer (NLE editor, sizzle-reel magic
 * UI, render preview pane).
 *
 * Status (2026-05-03): RENDER + SEEK ONLY. Drag/drop, trim handles,
 * and ripple-delete ship in the next commit.
 */

"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import { Lock, Volume2, VolumeX, Headphones, Film, Music } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  framesToSeconds,
  secondsToFrames,
  timelineDurationFrames,
  type Clip,
  type Timeline,
  type Track,
} from "@shared/timeline";
import { trimLeftEdge, trimRightEdge } from "@/lib/timeline/operations";
import { NLE_SOURCE_DRAG_MIME } from "./SourcePanel";

interface Props {
  timeline: Timeline;
  /** Current playhead position in frames. Source of truth lives in the
   *  parent so transport state survives re-renders driven by edits. */
  currentFrame: number;
  /** Click on the ruler or empty track area to seek. */
  onSeek: (frame: number) => void;
  /** Replace the timeline with the next state. */
  onTimelineChange: (next: Timeline) => void;
  /** Currently selected clip id; null when nothing is selected. Owned
   *  by the parent so selection survives across re-renders driven by
   *  edits AND so clip-targeting actions in the toolbar (Delete, Split)
   *  read from one source. */
  selectedClipId: string | null;
  onSelectClip: (clipId: string | null) => void;
  /** Fires when a source is dropped on a track. Parent owns the
   *  source library + insertClip dispatch (sources only live in
   *  NleCanvas, this component is purely presentational about timeline
   *  data). */
  onDropSource?: (trackId: string, sourceId: string, startFrame: number) => void;
  /** Width of one frame in CSS pixels. Default ≈ 4 for 30fps gives ~120px/sec. */
  pxPerFrame?: number;
}

const TRACK_HEIGHT = 56; // px
const RULER_HEIGHT = 28; // px
const TRACK_HEADER_WIDTH = 120; // px

export default function TimelineCanvas({
  timeline,
  currentFrame,
  onSeek,
  onTimelineChange,
  selectedClipId,
  onSelectClip,
  onDropSource,
  pxPerFrame: pxPerFrameProp,
}: Props) {
  const [zoomLevel, setZoomLevel] = useState(2); // 0..4, indexes into ZOOM_PX
  const ZOOM_PX = useMemo(() => [1, 2, 4, 8, 16] as const, []);
  const pxPerFrame = pxPerFrameProp ?? ZOOM_PX[zoomLevel];

  const totalFrames = useMemo(
    () => Math.max(timelineDurationFrames(timeline), timeline.fps * 30), // min 30s of timeline visible
    [timeline],
  );
  const totalWidth = totalFrames * pxPerFrame;
  const trackAreaRef = useRef<HTMLDivElement | null>(null);

  // ── Seek handlers ────────────────────────────────────────────────────
  // Per the DRY rule, both the ruler and empty-track-area handlers go
  // through the same frame-from-pointer-event helper.
  const frameFromEvent = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      return Math.max(0, Math.round(x / pxPerFrame));
    },
    [pxPerFrame],
  );

  const handleRulerSeek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      onSeek(frameFromEvent(e));
    },
    [frameFromEvent, onSeek],
  );

  // ── Track mutations — the shared helper for every per-track mix tweak ─
  const patchTrack = useCallback(
    (trackId: string, patch: Partial<Track>) => {
      onTimelineChange({
        ...timeline,
        tracks: timeline.tracks.map((t) => (t.id === trackId ? { ...t, ...patch } : t)),
      });
    },
    [timeline, onTimelineChange],
  );

  // ── Ruler tick computation ───────────────────────────────────────────
  // Pick a tick density that keeps labels readable at the current zoom.
  // One major tick per second when zoom is high; per 5/10 seconds when low.
  const secondsPerMajorTick = useMemo(() => {
    const pxPerSecond = pxPerFrame * timeline.fps;
    if (pxPerSecond >= 80) return 1;
    if (pxPerSecond >= 40) return 2;
    if (pxPerSecond >= 20) return 5;
    if (pxPerSecond >= 10) return 10;
    return 30;
  }, [pxPerFrame, timeline.fps]);

  const majorTicks = useMemo(() => {
    const totalSeconds = framesToSeconds(totalFrames, timeline.fps);
    const ticks: number[] = [];
    for (let s = 0; s <= totalSeconds; s += secondsPerMajorTick) ticks.push(s);
    return ticks;
  }, [totalFrames, timeline.fps, secondsPerMajorTick]);

  const playheadX = currentFrame * pxPerFrame;

  return (
    <div className="flex h-full flex-col bg-muted/20">
      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 border-b bg-background px-3 py-1.5 text-xs">
        <span className="font-mono tabular-nums text-muted-foreground">
          {framesToSeconds(currentFrame, timeline.fps).toFixed(2)}s
          <span className="mx-1 opacity-40">·</span>
          {currentFrame}f
        </span>
        <div className="ml-auto flex items-center gap-1">
          <span className="text-muted-foreground">Zoom</span>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            onClick={() => setZoomLevel((z) => Math.max(0, z - 1))}
            disabled={zoomLevel === 0}
          >
            −
          </Button>
          <span className="font-mono w-8 text-center">{pxPerFrame}px</span>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            onClick={() => setZoomLevel((z) => Math.min(ZOOM_PX.length - 1, z + 1))}
            disabled={zoomLevel === ZOOM_PX.length - 1}
          >
            +
          </Button>
        </div>
      </div>

      {/* ── Tracks + ruler (one horizontal scroll container) ────────── */}
      <div className="relative flex-1 overflow-auto" ref={trackAreaRef}>
        <div className="flex" style={{ minWidth: TRACK_HEADER_WIDTH + totalWidth }}>
          {/* Track header column — sticky-left so it stays visible during horizontal scroll. */}
          <div
            className="sticky left-0 z-10 flex flex-col border-r bg-background"
            style={{ width: TRACK_HEADER_WIDTH }}
          >
            <div
              className="flex items-center border-b px-2 text-[10px] uppercase tracking-wider text-muted-foreground"
              style={{ height: RULER_HEIGHT }}
            >
              Tracks
            </div>
            {timeline.tracks.map((track) => (
              <TrackHeader
                key={track.id}
                track={track}
                onPatch={(patch) => patchTrack(track.id, patch)}
              />
            ))}
          </div>

          {/* Scrollable content — ruler on top, tracks below, playhead overlay. */}
          <div className="relative flex flex-col" style={{ width: totalWidth }}>
            {/* Ruler */}
            <div
              className="relative border-b bg-background/70 select-none cursor-pointer"
              style={{ height: RULER_HEIGHT }}
              onClick={handleRulerSeek}
            >
              {majorTicks.map((sec) => {
                const x = secondsToFrames(sec, timeline.fps) * pxPerFrame;
                return (
                  <div
                    key={sec}
                    className="absolute top-0 h-full"
                    style={{ left: x }}
                  >
                    <div className="h-2 w-px bg-border" />
                    <span className="ml-0.5 font-mono text-[10px] text-muted-foreground">
                      {formatTime(sec)}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Tracks */}
            {timeline.tracks.map((track) => (
              <TrackRow
                key={track.id}
                track={track}
                pxPerFrame={pxPerFrame}
                onSeek={(frame) => onSeek(frame)}
                frameFromEvent={frameFromEvent}
                selectedClipId={selectedClipId}
                onSelectClip={onSelectClip}
                onDropSource={
                  onDropSource
                    ? (sourceId, startFrame) => onDropSource(track.id, sourceId, startFrame)
                    : undefined
                }
                onTrim={(clipId, edge, newFrame) => {
                  const next =
                    edge === "left"
                      ? trimLeftEdge(timeline, clipId, newFrame)
                      : trimRightEdge(timeline, clipId, newFrame);
                  onTimelineChange(next);
                }}
              />
            ))}

            {/* Playhead — absolutely positioned over the entire scroll area. */}
            <div
              className="pointer-events-none absolute top-0 bottom-0 z-20 w-px bg-primary"
              style={{ left: playheadX }}
            >
              <div className="absolute -left-1.5 -top-1 h-3 w-3 rotate-45 bg-primary" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Track header — left sticky column with mix controls
// ---------------------------------------------------------------------------

function TrackHeader({
  track,
  onPatch,
}: {
  track: Track;
  onPatch: (patch: Partial<Track>) => void;
}) {
  const Icon = track.kind === "video" ? Film : Music;
  return (
    <div
      className="flex flex-col justify-between gap-1 border-b p-1.5"
      style={{ height: TRACK_HEIGHT }}
    >
      <div className="flex items-center gap-1.5 text-xs">
        <Icon className="h-3 w-3 text-muted-foreground shrink-0" />
        <span className="font-medium truncate">{track.label}</span>
        {track.locked && <Lock className="h-3 w-3 text-muted-foreground" />}
      </div>
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant={track.muted ? "default" : "ghost"}
          className="h-5 w-5 p-0"
          onClick={() => onPatch({ muted: !track.muted })}
          title={track.muted ? "Unmute" : "Mute"}
        >
          {track.muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
        </Button>
        {track.kind === "audio" && (
          <Button
            size="sm"
            variant={track.solo ? "default" : "ghost"}
            className="h-5 w-5 p-0"
            onClick={() => onPatch({ solo: !track.solo })}
            title={track.solo ? "Unsolo" : "Solo"}
          >
            <Headphones className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Track row — clip strip
// ---------------------------------------------------------------------------

function TrackRow({
  track,
  pxPerFrame,
  onSeek,
  frameFromEvent,
  selectedClipId,
  onSelectClip,
  onDropSource,
  onTrim,
}: {
  track: Track;
  pxPerFrame: number;
  onSeek: (frame: number) => void;
  frameFromEvent: (e: React.MouseEvent<HTMLDivElement>) => number;
  selectedClipId: string | null;
  onSelectClip: (clipId: string | null) => void;
  onDropSource?: (sourceId: string, startFrame: number) => void;
  onTrim: (clipId: string, edge: "left" | "right", newFrame: number) => void;
}) {
  // Empty-track click seeks AND clears selection. Click-on-clip
  // overrides via stopPropagation in ClipBlock.
  const onRowClick = (e: React.MouseEvent<HTMLDivElement>) => {
    onSelectClip(null);
    onSeek(frameFromEvent(e));
  };
  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (e.dataTransfer.types.includes(NLE_SOURCE_DRAG_MIME)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  };
  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    const sourceId = e.dataTransfer.getData(NLE_SOURCE_DRAG_MIME);
    if (!sourceId || !onDropSource) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const startFrame = Math.max(0, Math.round(x / pxPerFrame));
    onDropSource(sourceId, startFrame);
  };
  return (
    <div
      className={cn(
        "relative border-b",
        track.muted ? "bg-muted/40 opacity-60" : "bg-background",
      )}
      style={{ height: TRACK_HEIGHT }}
      onClick={onRowClick}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {track.clips.map((clip) => (
        <ClipBlock
          key={clip.id}
          clip={clip}
          pxPerFrame={pxPerFrame}
          kind={track.kind}
          selected={clip.id === selectedClipId}
          onSelect={() => onSelectClip(clip.id)}
          onTrim={(edge, newFrame) => onTrim(clip.id, edge, newFrame)}
        />
      ))}
      {track.clips.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[10px] uppercase tracking-wider text-muted-foreground/50">
          Drag a source here
        </div>
      )}
    </div>
  );
}

function ClipBlock({
  clip,
  pxPerFrame,
  kind,
  selected,
  onSelect,
  onTrim,
}: {
  clip: Clip;
  pxPerFrame: number;
  kind: Track["kind"];
  selected: boolean;
  onSelect: () => void;
  onTrim: (edge: "left" | "right", newFrame: number) => void;
}) {
  // Trim drag: capture pointer on the handle, translate horizontal
  // movement to a new frame, fire onTrim. The shared trim helpers in
  // operations.ts handle clamping/overlap/no-zero-width — this surface
  // just feeds them the proposed new frame.
  const beginTrim = (edge: "left" | "right") => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startStart = clip.startFrame;
    const startEnd = clip.startFrame + clip.durationFrames;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const deltaFrames = Math.round((ev.clientX - startX) / pxPerFrame);
      if (edge === "left") onTrim("left", startStart + deltaFrames);
      else onTrim("right", startEnd + deltaFrames);
    };
    const up = () => {
      target.releasePointerCapture(e.pointerId);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  return (
    <div
      className={cn(
        "absolute top-1 bottom-1 rounded border px-1.5 text-xs overflow-hidden cursor-pointer group",
        kind === "video"
          ? "border-blue-400/40 bg-blue-400/20 text-blue-100"
          : "border-emerald-400/40 bg-emerald-400/20 text-emerald-100",
        selected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
      )}
      style={{
        left: clip.startFrame * pxPerFrame,
        width: Math.max(2, clip.durationFrames * pxPerFrame),
      }}
      title={`${clip.id} · ${clip.durationFrames}f`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      <span className="block truncate font-mono">{clip.sourceId}</span>
      {/* Trim handles — only visible on the selected clip so an
          unselected timeline doesn't look like a wall of edges. */}
      {selected && (
        <>
          <div
            className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-primary/60 hover:bg-primary"
            onPointerDown={beginTrim("left")}
            onClick={(e) => e.stopPropagation()}
          />
          <div
            className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-primary/60 hover:bg-primary"
            onPointerDown={beginTrim("right")}
            onClick={(e) => e.stopPropagation()}
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
