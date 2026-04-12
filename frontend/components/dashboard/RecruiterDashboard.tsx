import React from "react";
import { Briefcase, Target, UserPlus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MetricGrid } from "./shared/MetricCard";
import NewCandidatesCard from "./shared/NewCandidatesCard";
import ScheduledInterviewsCard from "./shared/ScheduledInterviewsCard";

import type { BaseDashboard } from "@/lib/services/dashboard-service";

interface RecruiterDashboardProps {
  dashboardData: BaseDashboard & {
    candidateStats?: {
      totalCandidates: number;
      newCandidates: number;
      qualifiedCandidates: number;
      interviewedCandidates: number;
    };
    jobPostingStats?: {
      activeJobs: number;
      totalApplications: number;
      filledPositions: number;
      averageTimeToFill: number;
    };
    recruitmentMetrics?: {
      placementsMade: number;
      placementRate: number;
      averageTimeToHire: number;
      costPerHire: number;
    };
    newCandidates?: Array<{
      userId: string;
      name: string;
      email?: string;
      role?: string;
      location?: string;
      matchScore?: number;
      appliedAt: Date;
      jobTitle: string;
    }>;
    scheduledInterviews?: Array<{
      id: string;
      candidateName: string;
      jobTitle: string;
      date: string;
      time: string;
      type: string;
      status: string;
    }>;
    messageStats?: {
      unreadCount: number;
      totalConversations: number;
      recentMessages: Array<{
        conversationId: string;
        senderName: string;
        preview: string;
        sentAt: Date;
        isRead: boolean;
      }>;
    };
  };
  loading?: boolean;
  onRefresh?: () => void;
}

export function RecruiterDashboard({
  dashboardData,
  loading = false,
  onRefresh: _onRefresh,
}: RecruiterDashboardProps) {
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

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Metrics Grid */}
      <MetricGrid
        metrics={dashboardData.metrics || []}
        loading={loading}
        emptyMessage="Recruitment metrics will appear here once data is available."
      />

      {/* Candidate & Job Stats Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Candidate Statistics */}
        {dashboardData.candidateStats && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <UserPlus className="h-4 w-4 sm:h-5 sm:w-5" />
                Candidate Pipeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2 sm:gap-4">
                <div className="text-center p-2 sm:p-3 bg-muted/30 rounded-lg">
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
      </div>

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

      {/* Lists Row - New Candidates, Interviews */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <NewCandidatesCard candidates={dashboardData.newCandidates} loading={loading} />
        <ScheduledInterviewsCard interviews={dashboardData.scheduledInterviews} loading={loading} />
      </div>

    </div>
  );
}

export default RecruiterDashboard;
