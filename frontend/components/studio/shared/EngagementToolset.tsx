/**
 * EngagementToolset — the four engagement authoring dialogs (Chapters,
 * Thumbnails, in-video Forms, Review Comments) bundled as one drop-in
 * cluster. Each child renders its own trigger button + dialog and
 * self-gates on its own preconditions, so the toolset itself just
 * needs primitive props and a saved project.
 *
 * Editor-only host: this is mounted from the V2 editor's ActionsPanel,
 * where the host has canvas state to bind authored assets back to. The
 * Globe + Details drawer renders viewer *results* via
 * EngagementResultsPanel instead — authoring there would orphan the
 * artifact (no scene to anchor it to).
 *
 * Self-gates: returns `null` when there's no persisted projectId — the
 * dialogs all need a server-side row to write against.
 */

import { Suspense, lazy } from "react";

import type { SceneBoundary } from "@/components/studio/ChapterEditor";

const ChapterEditor = lazy(() => import("@/components/studio/ChapterEditor"));
const ThumbnailsDialog = lazy(
  () => import("@/components/studio/ThumbnailsDialog"),
);
const VideoFormsDialog = lazy(
  () => import("@/components/studio/VideoFormsDialog"),
);
const ReviewCommentsDialog = lazy(
  () => import("@/components/studio/ReviewCommentsDialog"),
);

interface Props {
  projectId: string | null;
  /** Compiled scene boundaries — used to auto-seed chapters from the
   *  storyboard the first time the Chapters dialog opens. */
  sceneBoundaries?: SceneBoundary[];
  /** Rendered video URL — drives the Thumbnails dialog's frame
   *  extraction. The dialog self-gates to a disabled state until a
   *  video exists. */
  videoUrl?: string | null;
  /** Total video duration; lets the thumbnails dialog space candidate
   *  frames evenly. Optional — the dialog falls back to the actual
   *  HTMLVideoElement duration once loaded. */
  durationSec?: number;
  /** Current preview playhead. Lets a new review comment anchor to
   *  the user's current scrub position. Defaults to 0 (general). */
  currentTimeSec?: number;
}

export default function EngagementToolset({
  projectId,
  sceneBoundaries,
  videoUrl,
  durationSec,
  currentTimeSec,
}: Props) {
  if (!projectId) return null;
  return (
    <>
      <Suspense fallback={null}>
        <ChapterEditor
          projectId={projectId}
          sceneBoundaries={sceneBoundaries}
        />
        <ThumbnailsDialog
          projectId={projectId}
          videoUrl={videoUrl ?? null}
          durationSec={durationSec}
        />
        <VideoFormsDialog projectId={projectId} />
        <ReviewCommentsDialog
          projectId={projectId}
          currentTimeSec={currentTimeSec}
        />
      </Suspense>
    </>
  );
}
