/**
 * VideoAnalyticsDashboard — thin wrapper that delegates to the
 * kind-agnostic <ArtifactAnalyticsDashboard kind="video">. Kept as a
 * separate symbol so the studio editor's import doesn't need to change.
 *
 * The legacy `/api/studio/analytics/projects/:id` endpoint stays mounted
 * during the migration bake window; the new endpoint serves identical
 * data shape so this swap is transparent. See Gap Register #1019.
 */

import ArtifactAnalyticsDashboard from "@/components/analytics/ArtifactAnalyticsDashboard";

interface VideoAnalyticsDashboardProps {
  projectId: string;
  videoDurationSec?: number;
}

export default function VideoAnalyticsDashboard({
  projectId,
  videoDurationSec,
}: VideoAnalyticsDashboardProps) {
  return (
    <ArtifactAnalyticsDashboard
      kind="video"
      artifactId={projectId}
      durationSec={videoDurationSec}
    />
  );
}
