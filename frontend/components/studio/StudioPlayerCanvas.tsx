// StudioPlayerCanvas — the canvas + playback chrome that the editor's
// Preview tab uses, lifted out so the public /v/:id page (and every
// other on-platform "play this studio video" surface) can mount the
// exact same component instead of duplicating the scrubber.
//
// Owns: aspect-ratio wrapper, <StudioPlayer/> mount, expand-to-fullscreen
// affordance, play/pause + seek scrubber with scene-tick markers,
// CTA-hotzones overlay.
//
// Does NOT own: Save/Publish/Generate UI, status labels, action steppers —
// those are editor-only and live in <StudioPreview/>.

import { useState, type ReactNode } from "react";
import { Maximize2, Pause, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import StudioPlayer from "@/components/studio/StudioPlayer";
import CtaHotzonesOverlay from "@/components/video/CtaHotzonesOverlay";
import type { CompiledVideo } from "@/lib/compiler/types";
import type { StudioProjectState } from "@/types/studio";
import type { ElementBox, SceneElement } from "@/types/video-script";
import { videoFiltersToCss } from "@/types/video-script";

export interface CtaHotzone {
  startSec: number;
  endSec: number;
  x: number;
  y: number;
  w: number;
  h: number;
  url: string;
}

export interface StudioPlayerCanvasProps {
  /** Slice of project state <StudioPlayer/> reads. Mirrors the
   *  in-editor caller so the public payload only needs the same four
   *  fields (script/videoUrl/voiceover/captions) — no synthetic
   *  StudioProjectState envelope. */
  state: Pick<StudioProjectState, "script" | "videoUrl" | "voiceover" | "captions">;
  compiledVideo: CompiledVideo | null;
  playing: boolean;
  currentTime: number;
  onPlayPause: () => void;
  onTimeUpdate: (t: number) => void;
  onEnded?: () => void;

  /** Pro-only branding-removal flag. Forwarded to <StudioPlayer/> which
   *  owns the visibility policy. */
  removeBrandingFlag?: boolean;

  /** When set, attaches per-second engagement analytics to the baked
   *  branch's underlying `<video>` element. Public surfaces pass the
   *  project id; editor surfaces omit it. */
  analyticsProjectId?: string;

  /** Live-branch overlay elements (editor only). */
  overlayElements?: SceneElement[];
  selectedElementId?: string | null;
  onSelectElement?: (id: string | null) => void;
  onUpdateElementBox?: (id: string, box: ElementBox) => void;

  /** Public-surface CTA hotzones overlay. Empty array on editor surface. */
  hotzones?: CtaHotzone[];

  /** Show the expand-to-fullscreen button + overlay. Editor sets true. */
  expandable?: boolean;

  /** Layout:
   *  - "static" — canvas at natural aspect, controls under it (editor
   *    right-panel + public surface).
   *  - "fill"   — canvas fills parent height, controls in a thin row
   *    at the bottom (editor center-panel resize behaviour). */
  layout?: "static" | "fill";

  /** Empty-state label shown when there's no compiled video AND no
   *  hosted videoUrl (editor's "Run to preview"; public surface
   *  defaults to "Video is being processed."). */
  emptyLabel?: string;

  /** Optional right-anchored slot in the controls row (editor mounts
   *  its SaveButton here). Public surface passes nothing. */
  controlsRightSlot?: ReactNode;

  className?: string;
}

function formatTime(sec: number): string {
  const safe = Number.isFinite(sec) && sec > 0 ? sec : 0;
  const m = Math.floor(safe / 60);
  const s = Math.floor(safe % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function StudioPlayerCanvas({
  state,
  compiledVideo,
  playing,
  currentTime,
  onPlayPause,
  onTimeUpdate,
  onEnded,
  removeBrandingFlag,
  overlayElements,
  selectedElementId,
  onSelectElement,
  onUpdateElementBox,
  hotzones,
  expandable = false,
  layout = "static",
  emptyLabel = "Run to preview",
  controlsRightSlot,
  analyticsProjectId,
  className,
}: StudioPlayerCanvasProps) {
  const [expanded, setExpanded] = useState(false);

  const totalDuration = compiledVideo?.totalDuration ?? 0;
  const filterCss = videoFiltersToCss(state.script?.video?.theme?.filters);

  // Canvas — aspect-ratio wrapper + <StudioPlayer/> + optional
  // expand/hotzone overlays. Same render in both layout modes.
  const canvas = (
    <div
      className="relative bg-black rounded-lg overflow-hidden"
      style={{
        aspectRatio: compiledVideo ? `${compiledVideo.width}/${compiledVideo.height}` : "16/9",
        ...(layout === "fill" ? { maxHeight: "100%", width: "auto", maxWidth: "100%" } : {}),
        filter: filterCss,
      }}
    >
      {compiledVideo || state.videoUrl ? (
        <StudioPlayer
          state={state}
          compiledVideo={compiledVideo}
          playing={playing}
          currentTime={currentTime}
          onTimeUpdate={onTimeUpdate}
          overlayElements={overlayElements}
          selectedElementId={selectedElementId}
          onSelectElement={onSelectElement}
          onUpdateElementBox={onUpdateElementBox}
          onEnded={onEnded}
          removeBrandingFlag={removeBrandingFlag}
          analyticsProjectId={analyticsProjectId}
          className="w-full h-full"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-xs">
          {emptyLabel}
        </div>
      )}

      {hotzones && hotzones.length > 0 && (
        <CtaHotzonesOverlay
          hotzones={hotzones}
          currentTimeSec={currentTime}
          onActivate={onPlayPause}
        />
      )}

      {expandable && compiledVideo && (
        <button
          type="button"
          className="absolute top-1.5 right-1.5 p-1 rounded bg-black/50 text-white hover:bg-black/80 transition-colors"
          onClick={() => setExpanded(true)}
          title="Expand preview"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );

  // Scrub bar — click + drag mapping. Shared by inline and fullscreen
  // modes so seek behaviour can't diverge.
  const seekFromPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!totalDuration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    onTimeUpdate(ratio * totalDuration);
  };

  const controls = compiledVideo && (
    <div className="flex items-center gap-2 w-full">
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onPlayPause}>
        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
      </Button>
      <div
        className="flex-1 relative h-2 bg-muted rounded-full overflow-hidden cursor-pointer touch-none"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          seekFromPointer(e);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) seekFromPointer(e);
        }}
        onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
        role="slider"
        aria-label="Seek video"
        aria-valuemin={0}
        aria-valuemax={totalDuration}
        aria-valuenow={currentTime}
      >
        <div
          className="absolute inset-y-0 left-0 bg-primary rounded-full transition-all"
          style={{ width: totalDuration ? `${(currentTime / totalDuration) * 100}%` : "0%" }}
        />
        {/* Scene boundary ticks — make it obvious where each storyboard
            card maps onto the timeline. Skip the 0-tick and any tick
            past the duration. */}
        {totalDuration > 0 &&
          state.script?.scenes
            ?.filter((s) => s.start > 0 && s.start < totalDuration)
            .map((s) => (
              <span
                key={`tick-${s.id}`}
                aria-hidden
                className="absolute top-0 bottom-0 w-px bg-background/70"
                style={{ left: `${(s.start / totalDuration) * 100}%` }}
              />
            ))}
      </div>
      <span className="text-[10px] text-muted-foreground font-mono">
        {formatTime(currentTime)} / {formatTime(totalDuration)}
      </span>
      {controlsRightSlot && <div className="ml-auto">{controlsRightSlot}</div>}
    </div>
  );

  return (
    <div className={cn("flex flex-col", className)}>
      {layout === "static" ? (
        <div className="p-3">
          {canvas}
          {controls && <div className="mt-2">{controls}</div>}
        </div>
      ) : (
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="flex-1 min-h-0 flex items-center justify-center bg-black overflow-hidden p-2">
            {canvas}
          </div>
          {controls && (
            <div className="shrink-0 flex items-center gap-2 px-2 py-1.5 border-t bg-background">
              {controls}
            </div>
          )}
        </div>
      )}

      {expanded && compiledVideo && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-8"
          onClick={() => setExpanded(false)}
        >
          <div
            className="relative w-full max-w-5xl"
            style={{ aspectRatio: `${compiledVideo.width}/${compiledVideo.height}` }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="absolute -top-8 right-0 text-white hover:text-white/70 transition-colors"
              onClick={() => setExpanded(false)}
            >
              <X className="w-5 h-5" />
            </button>
            <StudioPlayer
              state={state}
              compiledVideo={compiledVideo}
              playing={playing}
              currentTime={currentTime}
              onTimeUpdate={onTimeUpdate}
              onEnded={onEnded}
              removeBrandingFlag={removeBrandingFlag}
              analyticsProjectId={analyticsProjectId}
              className="w-full h-full rounded-lg overflow-hidden"
            />
            {hotzones && hotzones.length > 0 && (
              <CtaHotzonesOverlay
                hotzones={hotzones}
                currentTimeSec={currentTime}
                onActivate={onPlayPause}
              />
            )}
            <div className="flex items-center gap-3 mt-3">
              <Button variant="secondary" size="icon" className="h-8 w-8" onClick={onPlayPause}>
                {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </Button>
              <div
                className="flex-1 relative h-1.5 bg-white/20 rounded-full overflow-hidden cursor-pointer touch-none"
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  seekFromPointer(e);
                }}
                onPointerMove={(e) => {
                  if (e.currentTarget.hasPointerCapture(e.pointerId)) seekFromPointer(e);
                }}
                onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
                role="slider"
                aria-label="Seek video"
                aria-valuemin={0}
                aria-valuemax={totalDuration}
                aria-valuenow={currentTime}
              >
                <div
                  className="absolute inset-y-0 left-0 bg-white rounded-full transition-all"
                  style={{ width: totalDuration ? `${(currentTime / totalDuration) * 100}%` : "0%" }}
                />
              </div>
              <span className="text-xs text-white/70 font-mono">
                {formatTime(currentTime)} / {formatTime(totalDuration)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
