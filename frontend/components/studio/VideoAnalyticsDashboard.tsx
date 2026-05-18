"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Building,
  Clock,
  Eye,
  Loader2,
  MousePointerClick,
  TrendingDown,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import {
  getVideoAnalytics,
  type VideoAnalytics,
} from "@/lib/services/studio-features-service";
import {
  studioService,
  type StudioVideoEventCounts,
} from "@/lib/services/studio-service";

// ---------------------------------------------------------------------------

interface VideoAnalyticsDashboardProps {
  projectId: string;
  videoDurationSec?: number;
}

// ---------------------------------------------------------------------------

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Metric Card (local, single-purpose)
// ---------------------------------------------------------------------------

function StatCard({
  title,
  value,
  icon: Icon,
  loading,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  loading: boolean;
}) {
  if (loading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="h-4 w-24 bg-muted rounded animate-pulse" />
          <div className="h-4 w-4 bg-muted rounded animate-pulse" />
        </CardHeader>
        <CardContent>
          <div className="h-8 w-16 bg-muted rounded animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Engagement Heatmap
// ---------------------------------------------------------------------------

function EngagementHeatmap({
  heatmap,
  dropOffSecond,
  durationSec,
}: {
  heatmap: number[];
  dropOffSecond: number | null;
  durationSec: number;
}) {
  const maxVal = useMemo(
    () => Math.max(...heatmap, 1),
    [heatmap],
  );

  if (heatmap.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">
        No engagement data available yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>0s</span>
        <span>{formatDuration(durationSec)}</span>
      </div>

      {/* Bars */}
      <div className="relative flex items-end gap-px h-32">
        {heatmap.map((val, i) => {
          const pct = (val / maxVal) * 100;
          const isDropOff = dropOffSecond !== null && i === dropOffSecond;
          return (
            <div
              key={i}
              className="flex-1 min-w-0 group relative"
              style={{ height: "100%" }}
            >
              <div
                className={`absolute bottom-0 w-full rounded-t-[1px] transition-colors ${
                  isDropOff
                    ? "bg-red-500"
                    : "bg-primary/70 group-hover:bg-primary"
                }`}
                style={{ height: `${Math.max(pct, 2)}%` }}
              />

              {/* Tooltip on hover */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-10">
                <div className="rounded bg-popover px-2 py-1 text-[10px] shadow-md border whitespace-nowrap text-popover-foreground">
                  {i}s: {Math.round(val)}% viewers
                </div>
              </div>
            </div>
          );
        })}

        {/* Drop-off marker */}
        {dropOffSecond !== null && dropOffSecond < heatmap.length && (
          <div
            className="absolute bottom-0 top-0 w-px bg-red-500 pointer-events-none"
            style={{
              left: `${(dropOffSecond / heatmap.length) * 100}%`,
            }}
          >
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded bg-red-500 px-1.5 py-0.5 text-[10px] text-white whitespace-nowrap">
              <TrendingDown className="h-3 w-3" />
              Drop-off {dropOffSecond}s
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-primary/70" />
          Viewers (%)
        </span>
        {dropOffSecond !== null && (
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm bg-red-500" />
            Top drop-off
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Dashboard
// ---------------------------------------------------------------------------

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

  const duration = videoDurationSec ?? analytics?.heatmap?.length ?? 0;

  // Referrer breakdown comes straight from the backend rollup keyed on
  // document.referrer at view time — no proxy/derivation here. Older
  // payloads (pre-deploy) may omit the field; treat as empty.
  const referrerBreakdown = analytics?.referrers ?? [];

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Error */}
      {error && (
        <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* ── Metric cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          title="Total Views"
          // Prefer the /view POST counter (one row per page mount) over
          // the heatmap row count (which only lands on 30s tick /
          // beforeunload / ended and thus under-counts short visits).
          // Fall through to the heatmap when the events endpoint 403s.
          value={eventCounts?.views ?? analytics?.totalViews ?? 0}
          icon={Eye}
          loading={loading}
        />
        <StatCard
          title="CTA Clicks"
          value={
            eventCounts
              ? `${eventCounts.ctaClicks} (${Math.round(eventCounts.clickThroughRate * 100)}% CTR)`
              : "--"
          }
          icon={MousePointerClick}
          loading={loading}
        />
        <StatCard
          title="Avg Watch Time"
          value={
            analytics ? formatDuration(analytics.avgWatchTimeSec) : "--"
          }
          icon={Clock}
          loading={loading}
        />
        <StatCard
          title="Avg % Watched"
          value={
            analytics
              ? `${Math.round(analytics.avgPercentWatched)}%`
              : "--"
          }
          icon={BarChart3}
          loading={loading}
        />
      </div>

      {/* ── Engagement Heatmap ────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Engagement Heatmap
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : analytics ? (
            <EngagementHeatmap
              heatmap={analytics.heatmap}
              dropOffSecond={analytics.topDropOffSecond}
              durationSec={duration}
            />
          ) : null}
        </CardContent>
      </Card>

      {/* ── Viewer List ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            Viewers
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-4"
                >
                  <div className="h-4 w-32 bg-muted rounded animate-pulse" />
                  <div className="h-4 w-24 bg-muted rounded animate-pulse" />
                  <div className="h-4 w-12 bg-muted rounded animate-pulse" />
                  <div className="h-4 w-16 bg-muted rounded animate-pulse" />
                </div>
              ))}
            </div>
          ) : analytics && analytics.viewers.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Email</th>
                    <th className="pb-2 pr-4 font-medium">Company</th>
                    <th className="pb-2 pr-4 font-medium text-right">
                      Views
                    </th>
                    <th className="pb-2 pr-4 font-medium text-right">
                      Avg %
                    </th>
                    <th className="pb-2 font-medium text-right">Last Viewed</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.viewers.map((viewer) => (
                    <tr
                      key={viewer.id}
                      className="border-b last:border-0 hover:bg-muted/50 transition-colors"
                    >
                      <td className="py-2.5 pr-4">
                        {viewer.email ? (
                          <span className="font-medium">{viewer.email}</span>
                        ) : (
                          <span className="text-muted-foreground italic">
                            Anonymous
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4">
                        {viewer.company ? (
                          <span className="inline-flex items-center gap-1">
                            <Building className="h-3 w-3 text-muted-foreground" />
                            {viewer.company}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">--</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">
                        {viewer.views}
                      </td>
                      <td className="py-2.5 pr-4 text-right">
                        <Badge
                          variant={
                            viewer.avgPercent >= 75
                              ? "default"
                              : viewer.avgPercent >= 40
                                ? "secondary"
                                : "outline"
                          }
                          className="text-xs"
                        >
                          {Math.round(viewer.avgPercent)}%
                        </Badge>
                      </td>
                      <td className="py-2.5 text-right text-muted-foreground text-xs">
                        {formatDate(viewer.lastViewed)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">
              No viewer data available yet.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Referrer Breakdown ────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingDown className="h-4 w-4" />
            Traffic Sources
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-4 w-28 bg-muted rounded animate-pulse" />
                  <div className="flex-1 h-3 bg-muted rounded animate-pulse" />
                  <div className="h-4 w-8 bg-muted rounded animate-pulse" />
                </div>
              ))}
            </div>
          ) : referrerBreakdown.length > 0 ? (
            <div className="space-y-3">
              {referrerBreakdown.map(({ source, views }) => {
                const totalViews = analytics?.totalViews ?? 1;
                const pct = Math.round((views / totalViews) * 100);
                return (
                  <div key={source} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium truncate max-w-[60%]">
                        {source}
                      </span>
                      <span className="text-muted-foreground tabular-nums">
                        {views} view{views !== 1 ? "s" : ""} ({pct}%)
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary/70 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">
              No traffic source data available yet.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
