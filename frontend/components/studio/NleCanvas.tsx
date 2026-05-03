/**
 * NleCanvas — the frame-accurate multi-track timeline editor surface.
 *
 * NOT a page. Mounted INSIDE [StudioLayout.tsx](../../pages/studio/StudioLayout.tsx)
 * by [CanvasForProject](./CanvasForProject.tsx) when the loaded project's
 * `kind === 'nle'`. The surrounding studio shell (sidebar, save/render/share
 * actions, voiceover panel, brand kits, captions) is shared with the
 * scene-based editor — only the centre canvas swaps.
 *
 * Status (2026-05-03): SKELETON canvas. The data round-trip
 * (load → render metadata → save) is in place; the interactive timeline
 * itself (drag/drop, trim handles, scrubber, source library) ships in
 * follow-up commits.
 *
 * Save / render dispatch:
 *   - Save fires `onTimelineChange(next)`. The parent owns persistence
 *     so studio-wide undo/history continues to work.
 *   - Export dispatches via [renderTimeline()](../../lib/timeline/render.ts).
 *     Per the DRY rule, this component does not branch on engine — the
 *     facade picks WebCodecs vs ffmpeg.wasm internally.
 */

"use client";

import React, { useCallback, useMemo, useState } from "react";
import { Film } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { renderTimeline, isRenderable, pickRenderEngine } from "@/lib/timeline/render";
import {
  timelineDurationFrames,
  framesToSeconds,
  type Timeline,
  type MediaSource,
} from "@shared/timeline";

interface Props {
  timeline: Timeline;
  /** Every clip referenced from the timeline must have its source resolved
   *  here. Empty until the source library lands; the renderable check
   *  below catches the gap. */
  sources: Record<string, MediaSource>;
  /** Fires when the user mutates the timeline. Parent persists via the
   *  shared studio save flow. */
  onTimelineChange: (next: Timeline) => void;
  /** Title is owned by the parent (it's also surfaced in the sidebar's
   *  recent-projects list); we just receive it for display. */
  title: string;
}

export default function NleCanvas({ timeline, sources, onTimelineChange, title }: Props) {
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

  // Suppress unused-var lint while the interactive surface is unbuilt.
  // The handler will be wired to the timeline canvas in the next commit.
  void onTimelineChange;
  void renderable;
  void rendering;
  void renderProgress;
  void renderToFile;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center justify-center gap-2 text-base">
            <Film className="h-4 w-4" />
            {title || "Untitled film"}
            <Badge variant="outline" className="ml-2 text-[11px]">
              {timeline.width}×{timeline.height} · {timeline.fps}fps · {durationSeconds.toFixed(1)}s
            </Badge>
            <Badge variant="secondary" className="text-[11px]">
              render: {targetEngine}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            The NLE canvas is in active development. The data layer (project
            CRUD, Timeline JSON spec, render facade dispatch) is in place.
            The interactive multi-track timeline, source library, and
            compositing pipeline ship in subsequent commits.
          </p>
          <p>
            Save and Export are driven by the existing studio actions in the
            top toolbar — same surface as the scene-based editor.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
