/**
 * ArtifactAnalyticsDashboard — kind-agnostic metrics surface. Calls the
 * polymorphic `GET /api/analytics/artifacts/:kind/:id` endpoint and
 * hands the projected ArtifactMetrics to the shared <MetricsPanel>.
 *
 * Self-gating: returns null on 403 (viewer isn't the owner) so the
 * <EntityDetailsSheet> Metrics section can drop this in without its
 * own gate. Loading and "no data yet" states render inside.
 *
 * Replaces the per-kind dashboards that used to exist (video had its
 * own; nothing else did). See Gap Register #1019.
 */

import { useCallback, useEffect, useState } from "react";

import { MetricsPanel, type ArtifactMetrics, type ArtifactKind } from "@/components/analytics";
import type { ArtifactKind as ArtifactKindKey } from "@shared/artifact-views";
import { fetchArtifactAnalytics } from "@/lib/services/artifact-view-service";

interface Props {
  kind: ArtifactKindKey;
  artifactId: string;
  /** Optional — only video supplies this; static artifacts derive their
   *  axis length from the returned heatmap. */
  durationSec?: number;
}

/** Map the polymorphic kind onto the <MetricsPanel> kind enum. Both
 *  share the same string surface for the studio + scroll-text kinds;
 *  company / studio_template / service collapse to "channel" so the
 *  panel uses generic copy. The exhaustive switch is load-bearing —
 *  adding a kind to ARTIFACT_KINDS without a branch here is a compile
 *  error rather than a silent runtime fallback. */
function metricsPanelKind(kind: ArtifactKindKey): ArtifactKind {
  switch (kind) {
    case "video":
    case "podcast":
    case "voice":
    case "animation":
    case "image":
    case "comic":
    case "game":
    case "cad":
    case "resume":
    case "article":
    case "job":
    case "profile":
      return kind;
    case "company":
    case "studio_template":
    case "service":
      return "channel";
  }
}

export default function ArtifactAnalyticsDashboard({
  kind,
  artifactId,
  durationSec,
}: Props) {
  const [metrics, setMetrics] = useState<ArtifactMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchArtifactAnalytics(kind, artifactId);
      setMetrics(res);
    } catch (e: any) {
      // 403 = viewer isn't the owner; render the panel's empty state
      // rather than an angry banner. Anything else surfaces.
      if (e?.status === 403) setMetrics(null);
      else setError(e instanceof Error ? e.message : "Failed to load analytics.");
    } finally {
      setLoading(false);
    }
  }, [kind, artifactId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <MetricsPanel
      metrics={metrics}
      loading={loading}
      error={error}
      kind={metricsPanelKind(kind)}
      durationSec={durationSec ?? metrics?.heatmap?.length}
    />
  );
}
