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
  Megaphone,
  MousePointerClick,
  TrendingDown,
  Users,
} from "lucide-react";

import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import StatCard from "./StatCard";
import EngagementHeatmap from "./EngagementHeatmap";
import GeoHotspotMap from "./GeoHotspotMap";
import ReferrerBreakdown from "./ReferrerBreakdown";
import ViewerList from "./ViewerList";
import type { ArtifactKind, ArtifactMetrics } from "@/lib/analytics/artifact-metrics";

function formatDuration(sec: number, t: TFunction): string {
  const minutes = Math.floor(sec / 60);
  const seconds = Math.round(sec % 60);
  return minutes > 0
    ? t("analytics.metrics.durationMinSec", { minutes, seconds })
    : t("analytics.metrics.durationSec", { seconds });
}

/** Per-kind copy mapping for the engagement StatCards. ONE table feeds
 *  both the "Avg Watch Time" tile and the "Avg % Watched" tile so adding
 *  a new kind needs one edit, not two. Kinds not listed fall through to
 *  the generic "Watch Time" / "% Watched" labels. Returns i18n keys. */
function engagementLabelKeysFor(kind: ArtifactKind | undefined): {
  watchTimeKey: string;
  percentKey: string;
} {
  switch (kind) {
    case "resume":
    case "article":
      return { watchTimeKey: "analytics.metrics.avgReadTime", percentKey: "analytics.metrics.avgPctRead" };
    case "podcast":
    case "voice":
      return { watchTimeKey: "analytics.metrics.avgListenTime", percentKey: "analytics.metrics.avgPctListened" };
    case "image":
    case "comic":
    case "cad":
    case "job":
    case "profile":
      return { watchTimeKey: "analytics.metrics.avgViewTime", percentKey: "analytics.metrics.avgPctViewed" };
    case "game":
      return { watchTimeKey: "analytics.metrics.avgPlayTime", percentKey: "analytics.metrics.avgPctPlayed" };
    case "animation":
    case "video":
    case "channel":
    default:
      return { watchTimeKey: "headings.avgWatchTime", percentKey: "headings.avgPctWatched" };
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
  const { t } = useTranslation();
  const hasCtas = metrics?.ctaClicks !== undefined;
  // Impressions ship only for studio kinds (paid-media counts, #1140).
  const hasImpressions = metrics?.impressionCount !== undefined;
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
  const { watchTimeKey, percentKey } = engagementLabelKeysFor(kind);
  const noValue = t("analytics.metrics.noValue");

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
      <div
        className={cn(
          "grid grid-cols-2 gap-4",
          hasImpressions ? "sm:grid-cols-3 lg:grid-cols-5" : "sm:grid-cols-4",
        )}
      >
        <StatCard
          title={t("headings.totalViews")}
          value={metrics?.totalViews ?? 0}
          icon={Eye}
          loading={loading}
        />
        <StatCard
          title={t("analytics.metrics.ctaClicks")}
          value={
            hasCtas
              ? t("analytics.metrics.impressionsValue", {
                  value: metrics!.ctaClicks,
                  ctr: Math.round((metrics!.ctaClickThroughRate ?? 0) * 100),
                })
              : noValue
          }
          icon={MousePointerClick}
          loading={loading}
        />
        {hasImpressions && (
          <StatCard
            title={t("analytics.metrics.impressions")}
            value={t("analytics.metrics.impressionsValue", {
              value: metrics!.impressionCount ?? 0,
              ctr: Math.round((metrics!.impressionCtr ?? 0) * 100),
            })}
            icon={Megaphone}
            loading={loading}
          />
        )}
        <StatCard
          title={t(watchTimeKey)}
          value={hasWatchTime ? formatDuration(metrics!.avgWatchSec!, t) : noValue}
          icon={Clock}
          loading={loading}
        />
        <StatCard
          title={t(percentKey)}
          value={
            hasPercentWatched
              ? t("analytics.metrics.percentValue", { value: Math.round(metrics!.avgPercentWatched!) })
              : noValue
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
              {t("headings.engagementHeatmap")}
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
            {t("headings.viewers")}
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
            {t("headings.trafficSources")}
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
