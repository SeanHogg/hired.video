/**
 * TimelineSection — the studio shell's Timeline collapsible content.
 *
 * One component that picks the right inner timeline editor by the
 * project's `kind`. Per the standing DRY rule, StudioLayout never
 * branches on kind to decide what to render here — it always mounts
 * TimelineSection and passes both shapes; this component dispatches.
 *
 *   - kind='scene' → existing scene-block timeline (NLETimeline) over
 *                    `script.scenes`
 *   - kind='nle'   → frame-accurate multi-track editor (NleTimelineEditor)
 *                    over `Timeline` (the shared JSON spec)
 *
 * Each branch is responsible for emitting changes back through ITS
 * change handler. The branches don't know about each other.
 */

"use client";

import React from "react";
import NLETimeline from "./NLETimeline";
import NleTimelineEditor from "./nle/NleTimelineEditor";
import type { VideoScript } from "@/types/video-script";
import type { MediaSource, Timeline } from "@shared/timeline";

interface Props {
  kind: "scene" | "nle";
  // Scene-mode props
  script: VideoScript | null;
  onScriptChange: (s: VideoScript) => void;
  currentTime: number;
  onSeek: (t: number) => void;
  // NLE-mode props
  timeline: Timeline | null;
  onTimelineChange: (next: Timeline) => void;
  sources: Record<string, MediaSource>;
  selectedClipId: string | null;
  onSelectClip: (id: string | null) => void;
}

export default function TimelineSection(props: Props) {
  if (props.kind === "nle") {
    if (!props.timeline) {
      return (
        <div className="px-5 py-3 text-xs text-muted-foreground">
          Loading timeline…
        </div>
      );
    }
    return (
      <NleTimelineEditor
        timeline={props.timeline}
        onTimelineChange={props.onTimelineChange}
        sources={props.sources}
        selectedClipId={props.selectedClipId}
        onSelectClip={props.onSelectClip}
      />
    );
  }
  if (!props.script) {
    return (
      <div className="px-5 py-3 text-xs text-muted-foreground">
        Generate a script to see the timeline
      </div>
    );
  }
  return (
    <NLETimeline
      script={props.script}
      onScriptChange={props.onScriptChange}
      currentTime={props.currentTime}
      onSeek={props.onSeek}
    />
  );
}
