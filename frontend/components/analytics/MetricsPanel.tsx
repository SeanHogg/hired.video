/**
 * MetricsPanel — the one analytics surface every artifact (video,
 * resume, article, job posting, profile, channel) renders inside its
 * details/share/stats drawer. Same StatCards, same heatmap, same
 * viewer table, same traffic-source bars, same geo hotspot map.
 *
 * Sections self-gate on the data shape — pass `heatmap` and the
 * heatmap card renders; omit it and the card disappears. This is how
 * a static job posting (no time curve) and a video (per-second drop-
 * off curve) share one component.
 *
 * Per-artifact services own the adapter that maps their own endpoint
 * payload into `ArtifactMetrics`. The studio's adapter lives next to
 * the video analytics service (see studio-features-service.ts +
 * VideoAnalyticsDashboard.tsx for the canonical example).
 */

import {
  BarChart3,
  Clock,
  Eye,
  MousePointerClick,
  TrendingDown,
  Users,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import StatCard from "./StatCard";
import EngagementHeatmap from "./EngagementHeatmap";
import GeoHotspotMap from "./GeoHotspotMap";
import ReferrerBreakdown from "./ReferrerBreakdown";
import ViewerList from "./ViewerList";
import type { ArtifactKind, ArtifactMetrics } from "./types";

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** Per-kind copy mapping for the engagement StatCards. ONE table feeds
 *  both the "Avg Watch Time" tile and the "Avg % Watched" tile so adding
 *  a new kind needs one edit, not two. Kinds not listed fall through to
 *  the generic "Watch Time" / "% Watched" labels. */
function engagementLabelFor(kind: ArtifactKind | undefined): {
  watchTimeLabel: string;
  percentLabel: string;
} {
  switch (kind) {
    case "resume":
    case "article":
      return { watchTimeLabel: "Avg Read Time", percentLabel: "Avg % Read" };
    case "podcast":
    case "voice":
      return { watchTimeLabel: "Avg Listen Time", percentLabel: "Avg % Listened" };
    case "image":
    case "comic":
    case "cad":
    case "job":
    case "profile":
      return { watchTimeLabel: "Avg View Time", percentLabel: "Avg % Viewed" };
    case "game":
      return { watchTimeLabel: "Avg Play Time", percentLabel: "Avg % Played" };
    case "animation":
    case "video":
    case "channel":
    default:
      return { watchTimeLabel: "Avg Watch Time", percentLabel: "Avg % Watched" };
  }
}

interface Props {
  metrics: ArtifactMetrics | null;
  loading?: boolean;
  error?: string | null;
  /** Optional — used only for slightly tighter copy ("Avg watch time"
   *  vs. "Avg read time") and for the heatmap unit default. The panel
   *  renders perfectly well without it. */
  kind?: ArtifactKind;
  /** Length of the underlying artifact in seconds (videos) — when
   *  omitted, falls back to `metrics.heatmap.length`. */
  durationSec?: number;
}

export default function MetricsPanel({
  metrics,
  loading,
  error,
  kind,
  durationSec,
}: Props) {
  // Visibility of optional sections is derived purely from the data
  // shape so callers can't accidentally render an empty card just by
  // forgetting to pass a flag.
  const hasHeatmap = (metrics?.heatmap?.length ?? 0) > 0;
  const hasCtas = metrics?.ctaClicks !== undefined;
  const hasWatchTime = metrics?.avgWatchSec !== undefined;
  const hasPercentWatched = metrics?.avgPercentWatched !== undefined;
  const hasViewers = (metrics?.viewers?.length ?? 0) > 0;
  const hasReferrers = (metrics?.referrers?.length ?? 0) > 0;
  const hasCountries = (metrics?.countries?.length ?? 0) > 0;

  // Copy adjusts to the kind so a resume's "watch time" reads as
  // "read time", an image banner's reads as "view time", etc. Everything
  // else stays identical to keep the panel visually consistent across
  // artifacts. Mapping is centralised in `engagementLabelFor()` below
  // so adding a new kind is one entry — no two-place updates.
  const { watchTimeLabel, percentLabel } = engagementLabelFor(kind);

  const duration = durationSec ?? metrics?.heatmap?.length ?? 0;
  const heatmapUnit = metrics?.heatmapUnit ?? "s";

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* ── Stat cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          title="Total Views"
          value={metrics?.totalViews ?? 0}
          icon={Eye}
          loading={loading}
        />
        <StatCard
          title="CTA Clicks"
          value={
            hasCtas
              ? `${metrics!.ctaClicks} (${Math.round(
                  (metrics!.ctaClickThroughRate ?? 0) * 100,
                )}% CTR)`
              : "--"
          }
          icon={MousePointerClick}
          loading={loading}
        />
        <StatCard
          title={watchTimeLabel}
          value={hasWatchTime ? formatDuration(metrics!.avgWatchSec!) : "--"}
          icon={Clock}
          loading={loading}
        />
        <StatCard
          title={percentLabel}
          value={
            hasPercentWatched ? `${Math.round(metrics!.avgPercentWatched!)}%` : "--"
          }
          icon={BarChart3}
          loading={loading}
        />
      </div>

      {/* ── Engagement Heatmap (only when the payload carries one) ─── */}
      {(loading || hasHeatmap) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Engagement Heatmap
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading && !metrics ? (
              <div className="h-32 w-full bg-muted/40 rounded animate-pulse" />
            ) : hasHeatmap ? (
              <EngagementHeatmap
                heatmap={metrics!.heatmap!}
                dropOffSecond={metrics!.topDropOffSecond ?? null}
                durationSec={duration}
                unit={heatmapUnit}
              />
            ) : null}
          </CardContent>
        </Card>
      )}

      {/* ── Viewer list ──────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            Viewers
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ViewerList
            viewers={metrics?.viewers ?? []}
            loading={loading && !hasViewers}
          />
        </CardContent>
      </Card>

      {/* ── Geo hotspot map ──────────────────────────────────────── */}
      {(loading || hasCountries) && (
        <GeoHotspotMap
          countries={metrics?.countries ?? []}
          totalViews={metrics?.totalViews}
        />
      )}

      {/* ── Traffic sources ──────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingDown className="h-4 w-4" />
            Traffic Sources
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ReferrerBreakdown
            referrers={metrics?.referrers ?? []}
            totalViews={metrics?.totalViews ?? 0}
            loading={loading && !hasReferrers}
          />
        </CardContent>
      </Card>
    </div>
  );
}
