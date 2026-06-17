import React from "react";
import { TrendingUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MetricGrid } from "./shared/MetricCard";
import ProfileStatistics from "./shared/ProfileStatistics";
import ApplicationStatistics from "./shared/ApplicationStatistics";
import JobMatchesCard from "./shared/JobMatchesCard";
import UpcomingInterviewsCard from "./shared/UpcomingInterviewsCard";
import { DashboardFeed } from "./DashboardFeed";
import { DashboardGaugeRow } from "./gauge/DashboardGaugeRow";
import { buildJobSeekerGauge } from "@/lib/dashboard/gauge";

import type { JobSeekerDashboard as JobSeekerDashboardType } from "@/lib/services/dashboard-service";

interface JobSeekerDashboardProps {
  dashboardData: JobSeekerDashboardType;
  loading?: boolean;
  onRefresh?: () => void;
}

export function JobSeekerDashboard({
  dashboardData,
  loading = false,
  onRefresh: _onRefresh,
}: JobSeekerDashboardProps) {
  const { t } = useTranslation();
  if (loading) {
    return (
      <div className="space-y-4 sm:space-y-6">
        {/* Loading skeletons */}
        <div className="h-24 sm:h-32 bg-muted rounded-lg animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-20 sm:h-24 bg-muted rounded-lg animate-pulse"
            />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-48 sm:h-64 bg-muted rounded-lg animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">

      {/* Role-aware speedometer hero — job-readiness dial + rewards
          progress. Motivates posting a resume / video resume and turns
          engagement into a single glanceable score. */}
      <DashboardGaugeRow primary={buildJobSeekerGauge(dashboardData, t)} />

      {/* SuperAdmin-curated feed — fills the dashboard for new job seekers
          who have no activity yet, and surfaces featured tools / articles /
          content for everyone. Shows a friendly empty state on first login
          rather than a blank page. */}
      <DashboardFeed showEmptyState />

      {/* Metrics Grid */}
      <MetricGrid
        metrics={dashboardData.metrics || []}
        loading={loading}
        emptyMessage={t("messages.dashboardMetricsEmpty")}
      />

      {/* Profile & Application Stats Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <ProfileStatistics stats={dashboardData.profileStats} loading={loading} />
        <ApplicationStatistics stats={dashboardData.applicationStats} loading={loading} />
      </div>

      {/* Job Matches & Interviews Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <JobMatchesCard matches={dashboardData.jobMatches} loading={loading} />
        <UpcomingInterviewsCard interviews={dashboardData.upcomingInterviews} loading={loading} />
      </div>

      {/* Messages widget intentionally removed — unified into the
          CommunicationHub bell in the header. */}

      {/* Career Progress Summary */}
      {dashboardData.applicationStats && (
        <Card className="bg-gradient-to-r from-green-50 to-blue-50 border-green-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
              {t("headings.careerProgressSummary")}
            </CardTitle>
            <CardDescription>
              {t("messages.careerProgressDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {dashboardData.applicationStats.successRate}%
                </div>
                <div className="text-xs text-muted-foreground">
                  {t("metrics.successRate")}
                </div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {dashboardData.applicationStats.totalApplications}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t("metrics.applications")}
                </div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">
                  {dashboardData.applicationStats.interviewRequests}
                </div>
                <div className="text-xs text-muted-foreground">{t("metrics.interviews")}</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">
                  {dashboardData.profileStats?.totalViews ?? 0}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t("metrics.profileViews")}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

    </div>
  );
}

export default JobSeekerDashboard;
