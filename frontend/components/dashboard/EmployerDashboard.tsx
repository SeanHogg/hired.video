import React from "react";
import {
  Users,
  TrendingUp,
  Building2,
  UserPlus,
  Briefcase,
  Target,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MetricGrid } from "./shared/MetricCard";
import NewCandidatesCard from "./shared/NewCandidatesCard";
import ScheduledInterviewsCard from "./shared/ScheduledInterviewsCard";

import type { EmployerDashboard as EmployerDashboardType } from "@/lib/services/dashboard-service";

interface EmployerDashboardProps {
  dashboardData: EmployerDashboardType;
  loading?: boolean;
  onRefresh?: () => void;
}

export function EmployerDashboard({
  dashboardData,
  loading = false,
  onRefresh: _onRefresh,
}: EmployerDashboardProps) {
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
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-48 sm:h-64 bg-gray-200 rounded-lg animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Metrics Grid */}
      <MetricGrid
        metrics={dashboardData.metrics || []}
        loading={loading}
        emptyMessage={t("messages.employerMetricsEmpty")}
      />

      {/* Team & Budget Metrics Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Team Metrics */}
        {dashboardData.teamMetrics && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <Users className="h-4 w-4 sm:h-5 sm:w-5" />
                {t("headings.teamMetrics")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2 sm:gap-4">
                <div className="text-center p-3 bg-muted/30 rounded-lg">
                  <div className="text-2xl font-bold text-primary">
                    {dashboardData.teamMetrics.totalTeamMembers}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t("metrics.totalMembers")}
                  </div>
                </div>
                <div className="text-center p-3 bg-muted/30 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">
                    {dashboardData.teamMetrics.activeRecruiters}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t("metrics.activeRecruiters")}
                  </div>
                </div>
                <div className="text-center p-3 bg-muted/30 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">
                    {dashboardData.teamMetrics.openPositions}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t("metrics.openPositions")}
                  </div>
                </div>
                <div className="text-center p-3 bg-muted/30 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">
                    {dashboardData.teamMetrics.teamPerformanceScore}%
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t("metrics.performanceScore")}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Budget Statistics */}
        {dashboardData.budgetStats && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                {t("headings.budgetOverview")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">
                    {t("metrics.totalBudget")}
                  </span>
                  <span className="font-semibold">
                    ${dashboardData.budgetStats.totalBudget.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">
                    {t("metrics.spentAmount")}
                  </span>
                  <span className="font-semibold text-red-600">
                    ${dashboardData.budgetStats.spentAmount.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">
                    {t("metrics.remaining")}
                  </span>
                  <span className="font-semibold text-green-600">
                    $
                    {dashboardData.budgetStats.remainingBudget.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t">
                  <span className="text-sm text-muted-foreground">
                    {t("metrics.costPerHire")}
                  </span>
                  <span className="font-semibold">
                    ${dashboardData.budgetStats.costPerHire.toLocaleString()}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Company & Candidate Stats Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Company Statistics */}
        {dashboardData.companyStats && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                {t("headings.companyStatistics")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-muted/30 rounded-lg">
                  <div className="text-2xl font-bold text-primary">
                    {dashboardData.companyStats.totalEmployees}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t("metrics.totalEmployees")}
                  </div>
                </div>
                <div className="text-center p-3 bg-muted/30 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">
                    {dashboardData.companyStats.newHires}
                  </div>
                  <div className="text-xs text-muted-foreground">{t("metrics.newHires")}</div>
                </div>
                <div className="text-center p-3 bg-muted/30 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">
                    {dashboardData.companyStats.hiringVelocity}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t("metrics.hiringVelocity")}
                  </div>
                </div>
                <div className="text-center p-3 bg-muted/30 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">
                    {dashboardData.companyStats.employeeRetentionRate}%
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t("metrics.retentionRate")}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Candidate Statistics */}
        {dashboardData.candidateStats && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5" />
                {t("headings.candidatePipeline")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-muted/30 rounded-lg">
                  <div className="text-2xl font-bold text-primary">
                    {dashboardData.candidateStats.totalCandidates}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t("metrics.totalCandidates")}
                  </div>
                </div>
                <div className="text-center p-3 bg-muted/30 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">
                    {dashboardData.candidateStats.newCandidates}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t("metrics.newThisMonth")}
                  </div>
                </div>
                <div className="text-center p-3 bg-muted/30 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">
                    {dashboardData.candidateStats.qualifiedCandidates}
                  </div>
                  <div className="text-xs text-muted-foreground">{t("metrics.qualified")}</div>
                </div>
                <div className="text-center p-3 bg-muted/30 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">
                    {dashboardData.candidateStats.interviewedCandidates}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t("metrics.interviewed")}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Job Posting & Recruitment Metrics Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Job Posting Statistics */}
        {dashboardData.jobPostingStats && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Briefcase className="h-5 w-5" />
                {t("headings.jobPostingPerformance")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-muted/30 rounded-lg">
                  <div className="text-2xl font-bold text-primary">
                    {dashboardData.jobPostingStats.activeJobs}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t("metrics.activeJobs")}
                  </div>
                </div>
                <div className="text-center p-3 bg-muted/30 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">
                    {dashboardData.jobPostingStats.totalApplications}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t("metrics.totalApplications")}
                  </div>
                </div>
                <div className="text-center p-3 bg-muted/30 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">
                    {dashboardData.jobPostingStats.filledPositions}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t("metrics.filledPositions")}
                  </div>
                </div>
                <div className="text-center p-3 bg-muted/30 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">
                    {dashboardData.jobPostingStats.averageTimeToFill}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t("metrics.avgDaysToFill")}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recruitment Metrics */}
        {dashboardData.recruitmentMetrics && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                {t("headings.recruitmentPerformance")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">
                    {t("metrics.placementsMade")}
                  </span>
                  <span className="font-semibold text-green-600">
                    {dashboardData.recruitmentMetrics.placementsMade}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">
                    {t("metrics.placementRate")}
                  </span>
                  <span className="font-semibold">
                    {dashboardData.recruitmentMetrics.placementRate.toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">
                    {t("metrics.avgTimeToHire")}
                  </span>
                  <span className="font-semibold">
                    {t("labels.daysValue", { count: dashboardData.recruitmentMetrics.averageTimeToHire })}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t">
                  <span className="text-sm text-muted-foreground">
                    {t("metrics.costPerHire")}
                  </span>
                  <span className="font-semibold">
                    $
                    {dashboardData.recruitmentMetrics.costPerHire.toLocaleString()}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Lists Row - New Candidates, Interviews */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <NewCandidatesCard candidates={dashboardData.newCandidates as any} loading={loading} />
        <ScheduledInterviewsCard interviews={dashboardData.scheduledInterviews} loading={loading} />
      </div>

      {/* Performance Summary */}
      {dashboardData.recruitmentMetrics && (
        <Card className="bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-blue-600" />
              {t("headings.performanceSummary")}
            </CardTitle>
            <CardDescription>
              {t("messages.performanceSummaryDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {dashboardData.recruitmentMetrics.placementRate.toFixed(1)}%
                </div>
                <div className="text-xs text-muted-foreground">
                  {t("metrics.successRate")}
                </div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {dashboardData.recruitmentMetrics.averageTimeToHire}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t("metrics.daysToHire")}
                </div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">
                  {dashboardData.recruitmentMetrics.placementsMade}
                </div>
                <div className="text-xs text-muted-foreground">{t("metrics.placements")}</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">
                  $
                  {(
                    dashboardData.recruitmentMetrics.costPerHire / 1000
                  ).toFixed(1)}
                  k
                </div>
                <div className="text-xs text-muted-foreground">
                  {t("metrics.costPerHire")}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

    </div>
  );
}

export default EmployerDashboard;
