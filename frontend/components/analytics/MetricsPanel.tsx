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

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { durationMinSecParts } from "@/lib/format";

import StatCard from "./StatCard";
import EngagementHeatmap from "./EngagementHeatmap";
import GeoHotspotMap from "./GeoHotspotMap";
import ReferrerBreakdown from "./ReferrerBreakdown";
import ViewerList from "./ViewerList";
import type { ArtifactKind, ArtifactMetrics } from "@/lib/analytics/artifact-metrics";

interface EngagementLabelKeys {
  watchTimeKey: string;
  percentKey: string;
}

const READ_LABELS: EngagementLabelKeys = { watchTimeKey: "analytics.metrics.avgReadTime", percentKey: "analytics.metrics.avgPctRead" };
const LISTEN_LABELS: EngagementLabelKeys = { watchTimeKey: "analytics.metrics.avgListenTime", percentKey: "analytics.metrics.avgPctListened" };
const VIEW_LABELS: EngagementLabelKeys = { watchTimeKey: "analytics.metrics.avgViewTime", percentKey: "analytics.metrics.avgPctViewed" };
const PLAY_LABELS: EngagementLabelKeys = { watchTimeKey: "analytics.metrics.avgPlayTime", percentKey: "analytics.metrics.avgPctPlayed" };
const WATCH_LABELS: EngagementLabelKeys = { watchTimeKey: "headings.avgWatchTime", percentKey: "headings.avgPctWatched" };

/** Per-kind copy mapping for the engagement StatCards. ONE table feeds
 *  both the "Avg Watch Time" tile and the "Avg % Watched" tile so adding
 *  a new kind needs one edit, not two. Kinds not listed fall through to
 *  the generic "Watch Time" / "% Watched" labels. Values are i18n keys. */
const ENGAGEMENT_LABEL_KEYS: Partial<Record<ArtifactKind, EngagementLabelKeys>> = {
  resume: READ_LABELS,
  article: READ_LABELS,
  podcast: LISTEN_LABELS,
  voice: LISTEN_LABELS,
  image: VIEW_LABELS,
  comic: VIEW_LABELS,
  cad: VIEW_LABELS,
  job: VIEW_LABELS,
  profile: VIEW_LABELS,
  game: PLAY_LABELS,
};

function engagementLabelKeysFor(kind: ArtifactKind | undefined): EngagementLabelKeys {
  return (kind && ENGAGEMENT_LABEL_KEYS[kind]) || WATCH_LABELS;
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
  const watchParts = hasWatchTime ? durationMinSecParts(metrics!.avgWatchSec!) : null;
  const watchTimeText = watchParts
    ? watchParts.minutes > 0
      ? t("analytics.metrics.durationMinSec", watchParts)
      : t("analytics.metrics.durationSec", { seconds: watchParts.seconds })
    : noValue;

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
          value={watchTimeText}
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
