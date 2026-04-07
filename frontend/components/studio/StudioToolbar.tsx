"use client";

/**
 * StudioToolbar — thin top bar above the StudioPreview canvas, hosting
 * gap-closing actions: version history (#131), chapters (#141), AI script
 * rewriter (#144). Kept as a separate component so StudioLayout stays lean.
 */

import VersionHistoryDialog from "./VersionHistoryDialog";
import ChapterEditor from "./ChapterEditor";
import ScriptRewriterDialog from "./ScriptRewriterDialog";
import VideoFormsDialog from "./VideoFormsDialog";
import ReviewCommentsDialog from "./ReviewCommentsDialog";
import ThumbnailsDialog from "./ThumbnailsDialog";
import HookOptimizerDialog from "./HookOptimizerDialog";
import AudioMixerDialog from "./AudioMixerDialog";
import type { VideoScript } from "@/types/video-script";

interface Props {
  projectId: string | null;
  storyboard: unknown;
  script?: VideoScript | null;
  onScriptChange?: (s: VideoScript) => void;
  sceneBoundaries?: Array<{ start: number; title: string }>;
  videoUrl?: string | null;
  durationSec?: number;
  currentTimeSec?: number;
  onRestoreVersion: (storyboard: unknown) => void;
  onApplyRewrite: (scenes: Array<Record<string, unknown>>) => void;
  onApplyHook: (sceneZeroPatch: { title?: string; subtitle?: string; text?: string }) => void;
}

export default function StudioToolbar({
  projectId,
  storyboard,
  script,
  onScriptChange,
  sceneBoundaries,
  videoUrl,
  durationSec,
  currentTimeSec,
  onRestoreVersion,
  onApplyRewrite,
  onApplyHook,
}: Props) {
  return (
    <div className="shrink-0 flex items-center gap-1 px-3 py-1.5 border-b bg-muted/20 flex-wrap">
      <VersionHistoryDialog
        projectId={projectId}
        currentStoryboard={storyboard}
        onRestore={onRestoreVersion}
      />
      <ChapterEditor projectId={projectId} sceneBoundaries={sceneBoundaries} />
      <ScriptRewriterDialog projectId={projectId} storyboard={storyboard} onApply={onApplyRewrite} />
      <HookOptimizerDialog projectId={projectId} storyboard={storyboard} onApply={onApplyHook} />
      <AudioMixerDialog script={script} onScriptChange={onScriptChange} />
      <VideoFormsDialog projectId={projectId} />
      <ReviewCommentsDialog projectId={projectId} currentTimeSec={currentTimeSec} />
      <ThumbnailsDialog projectId={projectId} videoUrl={videoUrl ?? null} durationSec={durationSec} />
    </div>
  );
}
