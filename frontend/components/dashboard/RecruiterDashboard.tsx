import React from "react";
import { Users, Send, Award } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricGrid } from "./shared/MetricCard";
import { DashboardFeed } from "./DashboardFeed";
import { DashboardGaugeRow } from "./gauge/DashboardGaugeRow";
import { buildRecruiterGauge } from "@/lib/dashboard/gauge";

import type { RecruiterDashboard as RecruiterDashboardType } from "@/lib/services/dashboard-service";

interface RecruiterDashboardProps {
  dashboardData: RecruiterDashboardType;
  loading?: boolean;
  onRefresh?: () => void;
}

/** Compact stat tile — mirrors the muted-box idiom used by the other
 *  role dashboards so the recruiter surface reads consistently. */
function StatTile({
  value,
  label,
  tone = "text-primary",
}: {
  value: React.ReactNode;
  label: string;
  tone?: string;
}) {
  return (
    <div className="text-center p-3 bg-muted/30 rounded-lg">
      <div className={`text-2xl font-bold ${tone}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

export function RecruiterDashboard({
  dashboardData,
  loading = false,
  onRefresh: _onRefresh,
}: RecruiterDashboardProps) {
  const { t } = useTranslation();
  if (loading) {
    return (
      <div className="space-y-4 sm:space-y-6">
        {/* Loading skeletons */}
        <div className="h-24 sm:h-32 bg-gray-200 rounded-lg animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-20 sm:h-24 bg-gray-200 rounded-lg animate-pulse"
            />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-48 sm:h-64 bg-gray-200 rounded-lg animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  const { candidateStats, submissionStats, placementStats } = dashboardData;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Role-aware speedometer hero — sourcing-pipeline health + rewards. */}
      <DashboardGaugeRow primary={buildRecruiterGauge(dashboardData, t)} />

      {/* SuperAdmin-curated feed for recruiters (silent when uncurated). */}
      <DashboardFeed />

      {/* Metrics Grid */}
      <MetricGrid
        metrics={dashboardData.metrics || []}
        loading={loading}
        emptyMessage={t("messages.recruitmentMetricsEmpty")}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Talent pool */}
        {candidateStats && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <Users className="h-4 w-4 sm:h-5 sm:w-5" />
                {t("dashboard.recruiter.talentPool")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2 sm:gap-4">
                <StatTile value={candidateStats.totalCandidates} label={t("dashboard.recruiter.totalCandidates")} />
                <StatTile value={candidateStats.activeCandidates} label={t("dashboard.recruiter.activeCandidates")} tone="text-green-600" />
                <StatTile value={candidateStats.newCandidatesThisMonth} label={t("dashboard.recruiter.newThisMonth")} tone="text-blue-600" />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Submission funnel */}
        {submissionStats && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-5 w-5" />
                {t("dashboard.recruiter.submissionFunnel")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2 sm:gap-4">
                <StatTile value={submissionStats.submitted} label={t("dashboard.recruiter.submitted")} />
                <StatTile value={submissionStats.interviewing} label={t("dashboard.recruiter.interviewing")} tone="text-blue-600" />
                <StatTile value={submissionStats.offered} label={t("dashboard.recruiter.offered")} tone="text-amber-600" />
                <StatTile value={submissionStats.placed} label={t("dashboard.recruiter.placed")} tone="text-green-600" />
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Placements */}
      {placementStats && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-5 w-5" />
              {t("dashboard.recruiter.placements")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2 sm:gap-4">
              <StatTile value={placementStats.totalPlacements} label={t("dashboard.recruiter.totalPlacements")} />
              <StatTile value={`${placementStats.placementRate}%`} label={t("dashboard.recruiter.placementRate")} tone="text-green-600" />
              <StatTile
                value={`$${placementStats.totalCommissionEarned.toLocaleString()}`}
                label={t("dashboard.recruiter.commissionEarned")}
                tone="text-purple-600"
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default RecruiterDashboard;
