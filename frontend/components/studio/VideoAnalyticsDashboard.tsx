"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { MetricsPanel, type ArtifactMetrics } from "@/components/analytics";
import {
  getVideoAnalytics,
  type VideoAnalytics,
} from "@/lib/services/studio-features-service";
import {
  studioService,
  type StudioVideoEventCounts,
} from "@/lib/services/studio-service";

interface VideoAnalyticsDashboardProps {
  projectId: string;
  videoDurationSec?: number;
}

/** Project the video-specific endpoint payload onto the shared
 *  `ArtifactMetrics` shape so <MetricsPanel/> doesn't need to know
 *  anything about studio projects, CTA event counts, or the heatmap
 *  endpoint's particular naming. New artifact types follow the same
 *  pattern: write an adapter, hand the result to MetricsPanel. */
function toArtifactMetrics(
  analytics: VideoAnalytics | null,
  counts: StudioVideoEventCounts | null,
): ArtifactMetrics | null {
  if (!analytics && !counts) return null;

  return {
    // Prefer the /view POST counter (one row per page mount) over the
    // heatmap row count (which only lands on 30s tick / beforeunload /
    // ended and thus under-counts short visits). Fall back to the
    // heatmap when the events endpoint 403s.
    totalViews: counts?.views ?? analytics?.totalViews ?? 0,
    ctaClicks: counts?.ctaClicks,
    ctaClickThroughRate: counts?.clickThroughRate,
    avgWatchSec: analytics?.avgWatchTimeSec,
    avgPercentWatched: analytics?.avgPercentWatched,
    heatmap: analytics?.heatmap,
    topDropOffSecond: analytics?.topDropOffSecond ?? null,
    heatmapUnit: "s",
    viewers: analytics?.viewers,
    referrers: analytics?.referrers,
    countries: analytics?.countries,
  };
}

export default function VideoAnalyticsDashboard({
  projectId,
  videoDurationSec,
}: VideoAnalyticsDashboardProps) {
  const [analytics, setAnalytics] = useState<VideoAnalytics | null>(null);
  // CTA-click + share + CTR rollup comes from the per-project event-counts
  // endpoint; the heatmap endpoint above only knows about watch-time events.
  const [eventCounts, setEventCounts] = useState<StudioVideoEventCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [heatmap, counts] = await Promise.all([
        getVideoAnalytics(projectId),
        // Counts can 403 for free users on a Pro-gated endpoint — degrade
        // silently rather than surfacing the whole dashboard as broken.
        studioService.getVideoEventCounts(projectId).then(
          (r) => r.data ?? null,
          () => null,
        ),
      ]);
      setAnalytics(heatmap);
      setEventCounts(counts);
    } catch {
      setError("Failed to load analytics.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const metrics = useMemo(
    () => toArtifactMetrics(analytics, eventCounts),
    [analytics, eventCounts],
  );

  return (
    <MetricsPanel
      metrics={metrics}
      loading={loading}
      error={error}
      kind="video"
      durationSec={videoDurationSec ?? analytics?.heatmap?.length}
    />
  );
}
