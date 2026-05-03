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
 *   - selected clip id
 *   - render-job state (engine, progress, error)
 *   - in-session source library (Record<string, MediaSource>)
 *
 * Sources are kept inside this component for M1 because they're
 * session-scoped (blob: URLs from in-browser file probe). When server
 * upload lands, this state slot moves up to StudioLayout so it survives
 * project switches; the SourcePanel API stays the same.
 *
 * Per the standing DRY rule, this component does NOT branch on render
 * engine — `renderTimeline()` from `lib/timeline/render.ts` picks
 * WebCodecs vs ffmpeg.wasm based on the Timeline shape.
 */

"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Play, Scissors, Square, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import TimelineCanvas from "./TimelineCanvas";
import SourcePanel from "./SourcePanel";
import { renderTimeline, isRenderable, pickRenderEngine } from "@/lib/timeline/render";
import {
  framesToSeconds,
  secondsToFrames,
  timelineDurationFrames,
  type Timeline,
  type MediaSource,
} from "@shared/timeline";
import { deleteClip, findClip, insertClip, setOutTransition, splitClipAt } from "@/lib/timeline/operations";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  timeline: Timeline;
  /** Fires when the user mutates the timeline. Parent persists via the
   *  shared studio Save flow. */
  onTimelineChange: (next: Timeline) => void;
  /** Title is owned by the parent (it's also surfaced in the sidebar's
   *  recent-projects list); we just receive it for display. */
  title: string;
}

// ---------------------------------------------------------------------------
// ClipTransitionPicker — selects the out-edge transition kind + duration
// for the currently selected clip. Self-gates: returns null when the clip
// id doesn't resolve (per the DRY rule, no parent does the existence check).
// ---------------------------------------------------------------------------

function ClipTransitionPicker({
  timeline,
  clipId,
  onChange,
}: {
  timeline: Timeline;
  clipId: string;
  onChange: (next: Timeline) => void;
}) {
  const found = findClip(timeline, clipId);
  if (!found) return null;
  const tr = found.clip.outTransition;
  const kind = tr?.kind ?? "cut";
  const duration = tr?.durationFrames ?? Math.round(timeline.fps * 0.5);

  const apply = (nextKind: typeof kind) => {
    if (nextKind === "cut") {
      onChange(setOutTransition(timeline, clipId, null));
    } else {
      onChange(
        setOutTransition(timeline, clipId, {
          kind: nextKind,
          durationFrames: duration,
        }),
      );
    }
  };

  return (
    <Select value={kind} onValueChange={(v) => apply(v as typeof kind)}>
      <SelectTrigger className="h-8 w-44 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="cut">Out: Cut</SelectItem>
        <SelectItem value="cross-dissolve">Out: Cross-dissolve</SelectItem>
        <SelectItem value="fade-to-black">Out: Fade to black</SelectItem>
      </SelectContent>
    </Select>
  );
}

export default function NleCanvas({ timeline, onTimelineChange, title }: Props) {
  const [currentFrame, setCurrentFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [sources, setSources] = useState<Record<string, MediaSource>>({});

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

  const deleteSelectedClip = useCallback(() => {
    if (!selectedClipId) return;
    onTimelineChange(deleteClip(timeline, selectedClipId));
    setSelectedClipId(null);
  }, [selectedClipId, timeline, onTimelineChange]);

  const splitSelectedAtPlayhead = useCallback(() => {
    if (!selectedClipId) return;
    const result = splitClipAt(timeline, selectedClipId, currentFrame);
    if (!result) {
      toast.error("Playhead is outside the selected clip");
      return;
    }
    onTimelineChange(result.timeline);
    setSelectedClipId(result.rightId);
  }, [selectedClipId, timeline, currentFrame, onTimelineChange]);

  /**
   * Drop-from-source handler for the timeline canvas. Translates the
   * source's native duration into timeline frames, then inserts via the
   * shared operations helper so overlap detection stays consistent
   * with click-to-add and any future paste/macro path.
   */
  const handleDropSource = useCallback(
    (trackId: string, sourceId: string, startFrame: number) => {
      const src = sources[sourceId];
      if (!src) return;
      const durationFrames = secondsToFrames(
        framesToSeconds(src.durationFrames, src.fps),
        timeline.fps,
      );
      try {
        const result = insertClip(timeline, trackId, {
          sourceId,
          startFrame,
          durationFrames,
          ...(src.kind === "audio" ? { gain: 1 } : {}),
        });
        onTimelineChange(result.timeline);
        setSelectedClipId(result.clipId);
      } catch (err) {
        toast.error("Couldn't drop clip", {
          description: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [sources, timeline, onTimelineChange],
  );

  // Keyboard shortcuts. The DRY rule applies here too — every shortcut
  // calls the same handlers the toolbar buttons do, so adding a button
  // never desyncs from the keyboard binding.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't fire when typing into an input.
      if (e.target instanceof HTMLElement) {
        const tag = e.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || e.target.isContentEditable) return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedClipId) {
          e.preventDefault();
          deleteSelectedClip();
        }
      } else if (e.key === "s" || e.key === "S") {
        if (selectedClipId) {
          e.preventDefault();
          splitSelectedAtPlayhead();
        }
      } else if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedClipId, deleteSelectedClip, splitSelectedAtPlayhead]);

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
          {selectedClipId && (
            <>
              <ClipTransitionPicker
                timeline={timeline}
                clipId={selectedClipId}
                onChange={onTimelineChange}
              />
              <Button size="sm" variant="ghost" onClick={splitSelectedAtPlayhead} title="Split at playhead (S)">
                <Scissors className="mr-1.5 h-3.5 w-3.5" />
                Split
              </Button>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={deleteSelectedClip} title="Delete clip (Del)">
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Delete
              </Button>
            </>
          )}
          <Button size="sm" variant="ghost" onClick={togglePlayback}>
            {playing ? <Square className="mr-1.5 h-3.5 w-3.5" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}
            {playing ? "Stop" : "Play"}
          </Button>
          <Button size="sm" onClick={renderToFile} disabled={!renderable || rendering}>
            {rendering ? `Rendering ${(renderProgress * 100).toFixed(0)}%` : "Export"}
          </Button>
        </div>
      </div>

      {/* ── Source panel + timeline (two-column workspace) ────────── */}
      <div className="flex flex-1 min-h-0">
        <div className="w-60 shrink-0">
          <SourcePanel
            sources={sources}
            onSourcesChange={setSources}
            timeline={timeline}
            onTimelineChange={onTimelineChange}
          />
        </div>
        <div className="flex-1 min-w-0">
          <TimelineCanvas
            timeline={timeline}
            currentFrame={currentFrame}
            onSeek={setCurrentFrame}
            onTimelineChange={onTimelineChange}
            selectedClipId={selectedClipId}
            onSelectClip={setSelectedClipId}
            onDropSource={handleDropSource}
          />
        </div>
      </div>
    </div>
  );
}
