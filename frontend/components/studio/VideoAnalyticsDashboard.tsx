/**
 * StudioProjectAnalyticsDashboard — thin wrapper that delegates to the
 * kind-agnostic <ArtifactAnalyticsDashboard>. Kept as a separate symbol
 * so callers in the editor / outreach surfaces don't need to know which
 * polymorphic kind to pass.
 *
 * Consumers that already know the project's mediaKind (e.g. ContentTab
 * which iterates the StudioProject DTO) pass it through; legacy callers
 * that only have a `projectId` default to "video" — same behaviour as
 * pre-#1137. The default is the migration ramp for the older callers;
 * a future pass closes #1141 by threading mediaKind everywhere.
 *
 * The legacy `/api/studio/analytics/projects/:id` endpoint stays mounted
 * during the migration bake window; the new endpoint serves identical
 * data shape so this swap is transparent. See Gap Register #1019 / #1137.
 *
 * Exported under the legacy `VideoAnalyticsDashboard` name as the
 * default export so import sites don't need to change.
 */

import ArtifactAnalyticsDashboard from "@/components/analytics/ArtifactAnalyticsDashboard";
import type { MediaKind } from "@shared/media-kinds";

interface VideoAnalyticsDashboardProps {
  projectId: string;
  /** When omitted, falls back to "video" — preserves the pre-#1137
   *  behaviour for callers that only have a projectId in scope. */
  mediaKind?: MediaKind;
  videoDurationSec?: number;
}

export default function VideoAnalyticsDashboard({
  projectId,
  mediaKind,
  videoDurationSec,
}: VideoAnalyticsDashboardProps) {
  return (
    <ArtifactAnalyticsDashboard
      kind={mediaKind ?? "video"}
      artifactId={projectId}
      durationSec={videoDurationSec}
    />
  );
}
