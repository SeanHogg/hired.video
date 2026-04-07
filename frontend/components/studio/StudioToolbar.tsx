"use client";

/**
 * StudioToolbar — thin top bar above the StudioPreview canvas, hosting
 * gap-closing actions: version history (#131), chapters (#141), AI script
 * rewriter (#144). Kept as a separate component so StudioLayout stays lean.
 */

import VersionHistoryDialog from "./VersionHistoryDialog";
import ChapterEditor from "./ChapterEditor";
import ScriptRewriterDialog from "./ScriptRewriterDialog";

interface Props {
  projectId: string | null;
  storyboard: unknown;
  sceneBoundaries?: Array<{ start: number; title: string }>;
  onRestoreVersion: (storyboard: unknown) => void;
  onApplyRewrite: (scenes: Array<Record<string, unknown>>) => void;
}

export default function StudioToolbar({
  projectId,
  storyboard,
  sceneBoundaries,
  onRestoreVersion,
  onApplyRewrite,
}: Props) {
  return (
    <div className="shrink-0 flex items-center gap-1 px-3 py-1.5 border-b bg-muted/20">
      <VersionHistoryDialog
        projectId={projectId}
        currentStoryboard={storyboard}
        onRestore={onRestoreVersion}
      />
      <ChapterEditor projectId={projectId} sceneBoundaries={sceneBoundaries} />
      <ScriptRewriterDialog projectId={projectId} storyboard={storyboard} onApply={onApplyRewrite} />
    </div>
  );
}
