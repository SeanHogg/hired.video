/**
 * EngagementToolset — the four engagement dialogs (Chapters,
 * Thumbnails, in-video Forms, Review Comments) bundled as one
 * drop-in cluster. Each child renders its own trigger button + dialog
 * and self-gates on its own preconditions, so the toolset itself just
 * needs primitive props and a saved project.
 *
 * Why this exists: the V2 editor's ActionsPanel and the Details side
 * panel both want this exact same four-button cluster. Defining the
 * cluster once here keeps both surfaces in sync — adding a fifth
 * engagement tool (in-video CTAs, NPS prompts, etc.) lands once and
 * shows up everywhere automatically (DRY rule).
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
  /** Compiled scene boundaries — pass them when the host has canvas
   *  state (editor). Omitted hosts (the Details panel summoned from
   *  the landing page) get manual chapter authoring instead of the
   *  auto-seed flow. */
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
  /** Optional layout knob — the editor lays the 4 triggers out in a
   *  grid of two columns; the Details panel stacks them. */
  className?: string;
}

export default function EngagementToolset({
  projectId,
  sceneBoundaries,
  videoUrl,
  durationSec,
  currentTimeSec,
  className,
}: Props) {
  if (!projectId) return null;
  return (
    <div className={className}>
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
    </div>
  );
}
