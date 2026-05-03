/**
 * NleCanvas — the frame-accurate multi-track timeline editor surface.
 *
 * NOT a page. Mounted INSIDE [StudioLayout.tsx](../../pages/studio/StudioLayout.tsx)
 * by [CanvasForProject](./CanvasForProject.tsx) when the loaded project's
 * `kind === 'nle'`. The surrounding studio shell (sidebar, save/render/share
 * actions, voiceover panel, brand kits, captions) is shared with the
 * scene-based editor — only the centre canvas swaps.
 *
 * Owns:
 *   - playhead state (current frame)
 *   - render-job state (engine, progress, error)
 *
 * Receives via props:
 *   - timeline (the JSON spec — parent owns persistence + undo/history)
 *   - sources (resolved MediaSource map for the clips referenced)
 *   - onTimelineChange (mutations bubble up)
 *
 * Per the standing DRY rule, this component does NOT branch on render
 * engine — `renderTimeline()` from `lib/timeline/render.ts` picks
 * WebCodecs vs ffmpeg.wasm based on the Timeline shape.
 */

"use client";

import React, { useCallback, useMemo, useState } from "react";
import { Loader2, Play, Save, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import TimelineCanvas from "./TimelineCanvas";
import { renderTimeline, isRenderable, pickRenderEngine } from "@/lib/timeline/render";
import {
  framesToSeconds,
  timelineDurationFrames,
  type Timeline,
  type MediaSource,
} from "@shared/timeline";

interface Props {
  timeline: Timeline;
  /** Every clip referenced from the timeline must have its source
   *  resolved here. Empty until the source library lands; the
   *  isRenderable check below catches the gap. */
  sources: Record<string, MediaSource>;
  /** Fires when the user mutates the timeline. Parent persists via the
   *  shared studio Save flow. */
  onTimelineChange: (next: Timeline) => void;
  /** Title is owned by the parent (it's also surfaced in the sidebar's
   *  recent-projects list); we just receive it for display. */
  title: string;
}

export default function NleCanvas({ timeline, sources, onTimelineChange, title }: Props) {
  const [currentFrame, setCurrentFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);

  // ── Derived metadata via shared/timeline.ts predicates (DRY) ─────────
  const renderable = useMemo(() => isRenderable(timeline), [timeline]);
  const targetEngine = useMemo(() => pickRenderEngine(timeline), [timeline]);
  const durationSeconds = useMemo(
    () => framesToSeconds(timelineDurationFrames(timeline), timeline.fps),
    [timeline],
  );

  const renderToFile = useCallback(async () => {
    try {
      setRendering(true);
      setRenderProgress(0);
      const result = await renderTimeline(timeline, sources, {
        onProgress: (p) => setRenderProgress(p),
      });
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title || "film"}.mp4`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Render complete", {
        description: `${(result.blob.size / (1024 * 1024)).toFixed(1)} MB · ${result.engine}`,
      });
    } catch (err) {
      toast.error("Render failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setRendering(false);
    }
  }, [timeline, sources, title]);

  const togglePlayback = useCallback(() => setPlaying((p) => !p), []);

  return (
    <div className="flex h-full flex-1 flex-col">
      {/* ── Top metadata strip ────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 border-b bg-background px-4 py-2">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-semibold truncate max-w-xs">{title || "Untitled film"}</span>
          <Badge variant="outline" className="text-[11px]">
            {timeline.width}×{timeline.height} · {timeline.fps}fps · {durationSeconds.toFixed(1)}s
          </Badge>
          <Badge variant="secondary" className="text-[11px]">
            render: {targetEngine}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={togglePlayback}>
            {playing ? <Square className="mr-1.5 h-3.5 w-3.5" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}
            {playing ? "Stop" : "Play"}
          </Button>
          <Button size="sm" variant="outline" disabled title="Use the studio Save in the sidebar">
            <Save className="mr-1.5 h-3.5 w-3.5" />
            Save via toolbar
          </Button>
          <Button size="sm" onClick={renderToFile} disabled={!renderable || rendering}>
            {rendering ? `Rendering ${(renderProgress * 100).toFixed(0)}%` : "Export"}
          </Button>
        </div>
      </div>

      {/* ── Timeline canvas ────────────────────────────────────────── */}
      <div className="flex-1 min-h-0">
        <TimelineCanvas
          timeline={timeline}
          currentFrame={currentFrame}
          onSeek={setCurrentFrame}
          onTimelineChange={onTimelineChange}
        />
      </div>
    </div>
  );
}
