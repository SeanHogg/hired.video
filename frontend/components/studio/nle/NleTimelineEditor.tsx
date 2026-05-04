/**
 * NleTimelineEditor — the Timeline-collapsible content for kind='nle'
 * projects. Sits where NLETimeline (scene-block UI) sits for kind='scene'
 * projects. Per the standing DRY rule there is ONE Timeline section in
 * StudioLayout that picks between the two via TimelineSection — this
 * component owns no chrome of its own (no Save/Export bar, no source
 * panel, no playback toolbar). The studio shell already provides those.
 *
 * Sources flow in from the existing studio sidebar's VIDEO / STOCK
 * MEDIA picker via the shared `NLE_MEDIA_DRAG_MIME` MIME, plus an
 * "Add clip" affordance that probes the underlying URL into a
 * MediaSource on first drop.
 *
 * The session-scoped MediaSource cache lives in the parent (StudioLayout)
 * so it survives project switches; this component just receives it +
 * a callback to register new sources.
 */

"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Scissors, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import TimelineCanvas from "../TimelineCanvas";
import {
  framesToSeconds,
  secondsToFrames,
  timelineDurationFrames,
  type Clip,
  type MediaSource,
  type Timeline,
} from "@shared/timeline";
import {
  deleteClip,
  findClip,
  insertClip,
  setOutTransition,
  splitClipAt,
} from "@/lib/timeline/operations";

interface Props {
  timeline: Timeline;
  onTimelineChange: (next: Timeline) => void;
  /** MediaSources known to the studio shell. Indexed by id. The
   *  Timeline references sources by id only; the shell resolves to
   *  URLs at the boundary so the Timeline is portable. */
  sources: Record<string, MediaSource>;
  /** Currently-selected clip id; lifted to the parent so the Actions
   *  tab's NleActionsPanel reads from the same selection. */
  selectedClipId: string | null;
  onSelectClip: (id: string | null) => void;
}

export default function NleTimelineEditor({
  timeline,
  onTimelineChange,
  sources,
  selectedClipId,
  onSelectClip,
}: Props) {
  const [currentFrame, setCurrentFrame] = useState(0);

  const durationSeconds = useMemo(
    () => framesToSeconds(timelineDurationFrames(timeline), timeline.fps),
    [timeline],
  );

  const deleteSelectedClip = useCallback(() => {
    if (!selectedClipId) return;
    onTimelineChange(deleteClip(timeline, selectedClipId));
    onSelectClip(null);
  }, [selectedClipId, timeline, onTimelineChange, onSelectClip]);

  const splitSelectedAtPlayhead = useCallback(() => {
    if (!selectedClipId) return;
    const result = splitClipAt(timeline, selectedClipId, currentFrame);
    if (!result) {
      toast.error("Playhead is outside the selected clip");
      return;
    }
    onTimelineChange(result.timeline);
    onSelectClip(result.rightId);
  }, [selectedClipId, timeline, currentFrame, onTimelineChange, onSelectClip]);

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
        onSelectClip(result.clipId);
      } catch (err) {
        toast.error("Couldn't drop clip", {
          description: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [sources, timeline, onTimelineChange, onSelectClip],
  );

  // Keyboard shortcuts. Same dispatch the toolbar buttons use, so a
  // future macro tool can call the same helpers without forking
  // semantics.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLElement) {
        const tag = e.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || e.target.isContentEditable) return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedClipId) {
        e.preventDefault();
        deleteSelectedClip();
      } else if ((e.key === "s" || e.key === "S") && selectedClipId) {
        e.preventDefault();
        splitSelectedAtPlayhead();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedClipId, deleteSelectedClip, splitSelectedAtPlayhead]);

  return (
    <div className="flex flex-col">
      {/* Compact action strip — duration + per-clip ops. The Save/
          Export/Render bar is owned by the studio shell elsewhere. */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-background text-xs">
        <Badge variant="outline" className="text-[11px]">
          {timeline.width}×{timeline.height} · {timeline.fps}fps · {durationSeconds.toFixed(1)}s
        </Badge>
        {selectedClipId && (
          <>
            <ClipTransitionPicker
              timeline={timeline}
              clipId={selectedClipId}
              onChange={onTimelineChange}
            />
            <Button size="sm" variant="ghost" className="h-7" onClick={splitSelectedAtPlayhead} title="Split at playhead (S)">
              <Scissors className="mr-1 h-3 w-3" />
              Split
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-destructive" onClick={deleteSelectedClip} title="Delete clip (Del)">
              <Trash2 className="mr-1 h-3 w-3" />
              Delete
            </Button>
          </>
        )}
      </div>
      <TimelineCanvas
        timeline={timeline}
        currentFrame={currentFrame}
        onSeek={setCurrentFrame}
        onTimelineChange={onTimelineChange}
        selectedClipId={selectedClipId}
        onSelectClip={onSelectClip}
        onDropSource={handleDropSource}
      />
    </div>
  );
}

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
  const tr: Clip["outTransition"] | undefined = found.clip.outTransition;
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
      <SelectTrigger className="h-7 w-44 text-xs">
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
