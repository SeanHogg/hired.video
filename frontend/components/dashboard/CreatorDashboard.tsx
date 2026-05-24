/**
 * CreatorDashboard — unified content-creator stats surface. Aggregates
 * views, unique viewers, countries reached, and per-artifact metrics
 * across everything the authed user owns (videos, resumes, articles,
 * jobs, profile, company, studio templates, services).
 *
 * Sits inside the existing /dashboard surface as a `profileMode ===
 * 'creator'` tab per the creator-persona memory — NOT a fourth role
 * dashboard. The page-level role dispatch (Dashboard.tsx) is unchanged;
 * this component is opt-in for the creator profile mode.
 *
 * Composition mirrors the shape of the per-artifact <MetricsPanel> so
 * a creator browsing the rollup and a creator opening a single
 * artifact's [🌐 Details] drawer see the same visual language.
 */

import { useEffect, useState } from "react";
import { Globe2, Users, Eye, BarChart3, Loader2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import StatCard from "@/components/analytics/StatCard";
import GeoHotspotMap from "@/components/analytics/GeoHotspotMap";
import ReferrerBreakdown from "@/components/analytics/ReferrerBreakdown";
import MetricBadgeCluster from "@/components/shared/MetricBadgeCluster";
import {
  fetchCreatorRollup,
  type CreatorRollup,
} from "@/lib/services/artifact-view-service";

const KIND_LABEL: Record<string, string> = {
  video: "Video",
  resume: "Resume",
  article: "Article",
  job: "Job",
  profile: "Profile",
  company: "Company",
  studio_template: "Template",
  service: "Service",
};

export default function CreatorDashboard() {
  const [rollup, setRollup] = useState<CreatorRollup | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchCreatorRollup()
      .then((r) => { if (!cancelled) setRollup(r); })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load stats.");
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading && !rollup) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading creator stats…
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-destructive">{error}</CardContent>
      </Card>
    );
  }

  if (!rollup || rollup.totals.artifactCount === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          <BarChart3 className="mx-auto mb-3 h-10 w-10 opacity-50" />
          <p className="font-medium mb-1">No views yet</p>
          <p className="text-sm">
            Publish a resume, video, article, or template to start collecting
            engagement stats. Every public artifact you own will roll up here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top stat strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Total views"
          value={rollup.totals.totalViews}
          icon={<Eye className="h-4 w-4" />}
        />
        <StatCard
          label="Unique viewers"
          value={rollup.totals.uniqueViewers}
          icon={<Users className="h-4 w-4" />}
        />
        <StatCard
          label="Countries"
          value={rollup.totals.countriesReached}
          icon={<Globe2 className="h-4 w-4" />}
        />
        <StatCard
          label="Artifacts"
          value={rollup.totals.artifactCount}
          icon={<BarChart3 className="h-4 w-4" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Geo distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <GeoHotspotMap countries={rollup.countries} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Traffic sources</CardTitle>
          </CardHeader>
          <CardContent>
            <ReferrerBreakdown referrers={rollup.referrers.slice(0, 10)} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Your content</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {rollup.artifacts.map((a) => (
            <div
              key={`${a.artifactKind}:${a.artifactId}`}
              className="flex items-center gap-3 rounded border bg-card p-2"
            >
              <div className="w-12 h-12 rounded bg-muted overflow-hidden shrink-0 flex items-center justify-center">
                {a.thumbnail ? (
                  <img
                    src={a.thumbnail}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <BarChart3 className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">
                    {KIND_LABEL[a.artifactKind] ?? a.artifactKind}
                  </Badge>
                  <span className="text-sm font-medium truncate">{a.title}</span>
                </div>
                <MetricBadgeCluster
                  className="mt-1"
                  badges={[
                    { label: "Views", value: a.totalViews, tone: "info" },
                    { label: "Viewers", value: a.uniqueViewers, tone: "neutral" },
                    {
                      label: "Engagement",
                      value: `${a.avgPercentConsumed}%`,
                      tone: a.avgPercentConsumed >= 60 ? "positive" : "neutral",
                    },
                  ]}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
