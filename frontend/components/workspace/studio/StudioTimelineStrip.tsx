/**
 * StudioTimelineStrip — a time-based studio format's 150px strip: back to
 * start · play · scrub · time on the header row, then the ONE
 * `<AdvancedTimeline>`. Simple shows its minimal scene strip + audio
 * summary; Advanced shows the full multi-track view in the same strip
 * (it scrolls; Expand lifts it into a taller overlay). One clock: the
 * editor's usePreviewPlayback.
 */
import { useTranslation } from "react-i18next";
import { totalDurationSeconds, type CanvasState } from "@/lib/studio/editor-v2/canvas-state";
import type { DragPayload } from "@/lib/studio/editor-v2/drag-protocol";
import type { usePreviewPlayback } from "@/lib/studio/editor-v2/use-preview-playback";
import type { Selection } from "@/components/studio/v2/CanvasStage";
import AdvancedTimeline, { type AudioPatch } from "@/components/studio/v2/AdvancedTimeline";
import WorkspaceStrip from "../WorkspaceStrip";
import StripPlaybackControls from "../StripPlaybackControls";
import { formatClock } from "@/lib/build/video-outline";

export interface StudioTimelineStripProps {
  state: CanvasState;
  advanced: boolean;
  playback: ReturnType<typeof usePreviewPlayback>;
  activeSceneId: string | null;
  selection: Selection;
  onSelectScene: (sceneId: string) => void;
  onSelectWidget: (sceneId: string, widgetId: string) => void;
  onSceneDurationChange: (sceneId: string, durationSeconds: number) => void;
  onWidgetWindowChange: (widgetId: string, visibleFrom: number | null, visibleTo: number | null) => void;
  selectedAudioLayerId: string | null;
  onSelectAudioLayer: (layerId: string) => void;
  onAudioLayerChange: (id: string, patch: AudioPatch) => void;
  onAudioCommit: () => void;
  onSplitAudioLayer: (layerId: string, atCompositionSec: number) => void;
  onRemoveAudioLayer: (layerId: string) => void;
  onMusicDrop: (payload: DragPayload) => void;
}

export default function StudioTimelineStrip({ state, advanced, playback, activeSceneId, selection, ...timeline }: StudioTimelineStripProps) {
  const { t } = useTranslation();
  const total = totalDurationSeconds(state);
  return (
    <WorkspaceStrip
      label={t("studio.timeline.headerTotal", { time: formatClock(total) })}
      ariaLabel={t("studio.editorV2.panelTimeline")}
      expandable={advanced}
      controls={
        <StripPlaybackControls playback={playback} total={playback.duration} backToStart />
      }
    >
      <AdvancedTimeline
        state={state}
        expanded={advanced}
        activeSceneId={activeSceneId}
        selectedWidgetId={selection.kind === "widget" ? selection.widgetId : null}
        playheadSec={playback.playhead}
        onSeek={playback.seek}
        {...timeline}
      />
    </WorkspaceStrip>
  );
}
