import React from "react";
import {
  Users,
  TrendingUp,
  Building2,
  UserPlus,
  Briefcase,
  Target,
} from "lucide-react";
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
        emptyMessage="Employer metrics will appear here once data is available."
      />

      {/* Team & Budget Metrics Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Team Metrics */}
        {dashboardData.teamMetrics && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <Users className="h-4 w-4 sm:h-5 sm:w-5" />
                Team Metrics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2 sm:gap-4">
                <div className="text-center p-3 bg-muted/30 rounded-lg">
                  <div className="text-2xl font-bold text-primary">
                    {dashboardData.teamMetrics.totalTeamMembers}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Total Members
                  </div>
                </div>
                <div className="text-center p-3 bg-muted/30 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">
                    {dashboardData.teamMetrics.activeRecruiters}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Active Recruiters
                  </div>
                </div>
                <div className="text-center p-3 bg-muted/30 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">
                    {dashboardData.teamMetrics.openPositions}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Open Positions
                  </div>
                </div>
                <div className="text-center p-3 bg-muted/30 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">
                    {dashboardData.teamMetrics.teamPerformanceScore}%
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Performance Score
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
                Budget Overview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">
                    Total Budget
                  </span>
                  <span className="font-semibold">
                    ${dashboardData.budgetStats.totalBudget.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">
                    Spent Amount
                  </span>
                  <span className="font-semibold text-red-600">
                    ${dashboardData.budgetStats.spentAmount.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">
                    Remaining
                  </span>
                  <span className="font-semibold text-green-600">
                    $
                    {dashboardData.budgetStats.remainingBudget.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t">
                  <span className="text-sm text-muted-foreground">
                    Cost per Hire
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
                Company Statistics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-muted/30 rounded-lg">
                  <div className="text-2xl font-bold text-primary">
                    {dashboardData.companyStats.totalEmployees}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Total Employees
                  </div>
                </div>
                <div className="text-center p-3 bg-muted/30 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">
                    {dashboardData.companyStats.newHires}
                  </div>
                  <div className="text-xs text-muted-foreground">New Hires</div>
                </div>
                <div className="text-center p-3 bg-muted/30 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">
                    {dashboardData.companyStats.hiringVelocity}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Hiring Velocity
                  </div>
                </div>
                <div className="text-center p-3 bg-muted/30 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">
                    {dashboardData.companyStats.employeeRetentionRate}%
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Retention Rate
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
                Candidate Pipeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-muted/30 rounded-lg">
                  <div className="text-2xl font-bold text-primary">
                    {dashboardData.candidateStats.totalCandidates}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Total Candidates
                  </div>
                </div>
                <div className="text-center p-3 bg-muted/30 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">
                    {dashboardData.candidateStats.newCandidates}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    New This Month
                  </div>
                </div>
                <div className="text-center p-3 bg-muted/30 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">
                    {dashboardData.candidateStats.qualifiedCandidates}
                  </div>
                  <div className="text-xs text-muted-foreground">Qualified</div>
                </div>
                <div className="text-center p-3 bg-muted/30 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">
                    {dashboardData.candidateStats.interviewedCandidates}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Interviewed
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
                Job Posting Performance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-muted/30 rounded-lg">
                  <div className="text-2xl font-bold text-primary">
                    {dashboardData.jobPostingStats.activeJobs}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Active Jobs
                  </div>
                </div>
                <div className="text-center p-3 bg-muted/30 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">
                    {dashboardData.jobPostingStats.totalApplications}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Total Applications
                  </div>
                </div>
                <div className="text-center p-3 bg-muted/30 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">
                    {dashboardData.jobPostingStats.filledPositions}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Filled Positions
                  </div>
                </div>
                <div className="text-center p-3 bg-muted/30 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">
                    {dashboardData.jobPostingStats.averageTimeToFill}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Avg. Days to Fill
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
                Recruitment Performance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">
                    Placements Made
                  </span>
                  <span className="font-semibold text-green-600">
                    {dashboardData.recruitmentMetrics.placementsMade}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">
                    Placement Rate
                  </span>
                  <span className="font-semibold">
                    {dashboardData.recruitmentMetrics.placementRate.toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">
                    Avg. Time to Hire
                  </span>
                  <span className="font-semibold">
                    {dashboardData.recruitmentMetrics.averageTimeToHire} days
                  </span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t">
                  <span className="text-sm text-muted-foreground">
                    Cost per Hire
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
              Performance Summary
            </CardTitle>
            <CardDescription>
              Key performance indicators for your recruitment operations
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {dashboardData.recruitmentMetrics.placementRate.toFixed(1)}%
                </div>
                <div className="text-xs text-muted-foreground">
                  Success Rate
                </div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {dashboardData.recruitmentMetrics.averageTimeToHire}
                </div>
                <div className="text-xs text-muted-foreground">
                  Days to Hire
                </div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">
                  {dashboardData.recruitmentMetrics.placementsMade}
                </div>
                <div className="text-xs text-muted-foreground">Placements</div>
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
                  Cost per Hire
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
