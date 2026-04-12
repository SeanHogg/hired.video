import React from "react";
import {
  Eye,
  FileText,
  Target,
  Calendar,
  TrendingUp,
  ArrowRight,
  Film,
  Chrome,
  Sparkles,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MetricGrid } from "./shared/MetricCard";
import ActivityFeed from "./shared/ActivityFeed";
import OnboardingProgress from "./shared/OnboardingProgress";
import ToolsCTA from "./shared/ToolsCTA";

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

  const onboardingPct = dashboardData.onboardingCompletionPercentage ?? 0;
  const hasProfileViews = (dashboardData.profileStats?.totalViews ?? 0) > 0;
  const hasApplications =
    (dashboardData.applicationStats?.totalApplications ?? 0) > 0;
  const isFirstRun = onboardingPct < 40 && !hasProfileViews && !hasApplications;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* First-Run Welcome Hero — three primary paths to time-to-value */}
      {isFirstRun && (
        <Card className="border-2 border-primary/30 bg-gradient-to-br from-blue-50 via-white to-purple-50 overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="h-5 w-5 text-primary" />
              <Badge className="bg-primary/10 text-primary hover:bg-primary/10">
                Welcome
              </Badge>
            </div>
            <CardTitle className="text-2xl sm:text-3xl">
              Get to your first win in 5 minutes
            </CardTitle>
            <CardDescription className="text-base">
              Pick any path below. You can always come back and try the others.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Path 1: Create a Video */}
              <Link
                to="/studio"
                className="group block p-5 rounded-lg bg-white border-2 border-blue-200 hover:border-blue-500 hover:shadow-md transition-all"
              >
                <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center mb-3 group-hover:bg-blue-200 transition-colors">
                  <Film className="h-6 w-6 text-blue-600" />
                </div>
                <h3 className="font-semibold text-base mb-1">
                  1. Create a Marketing Video
                </h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Open the Studio, import your resume, and record a 60-second
                  pitch that stands out.
                </p>
                <div className="flex items-center text-sm font-medium text-blue-600 group-hover:gap-2 transition-all">
                  Open Studio
                  <ArrowRight className="h-4 w-4 ml-1" />
                </div>
              </Link>

              {/* Path 2: Install Chrome Extension */}
              <Link
                to="/chrome-extension"
                className="group block p-5 rounded-lg bg-white border-2 border-green-200 hover:border-green-500 hover:shadow-md transition-all"
              >
                <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center mb-3 group-hover:bg-green-200 transition-colors">
                  <Chrome className="h-6 w-6 text-green-600" />
                </div>
                <h3 className="font-semibold text-base mb-1">
                  2. Find Jobs Faster
                </h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Install the Chrome extension to track jobs, score your
                  resume, and tailor it on any job board.
                </p>
                <div className="flex items-center text-sm font-medium text-green-600 group-hover:gap-2 transition-all">
                  Install Extension
                  <ArrowRight className="h-4 w-4 ml-1" />
                </div>
              </Link>

              {/* Path 3: Earn as a Creator */}
              <Link
                to="/services"
                className="group block p-5 rounded-lg bg-white border-2 border-purple-200 hover:border-purple-500 hover:shadow-md transition-all"
              >
                <div className="w-12 h-12 rounded-lg bg-purple-100 flex items-center justify-center mb-3 group-hover:bg-purple-200 transition-colors">
                  <Sparkles className="h-6 w-6 text-purple-600" />
                </div>
                <h3 className="font-semibold text-base mb-1">
                  3. Earn as a Creator
                </h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Got design, writing, or video skills? Offer services on the
                  marketplace and get paid.
                </p>
                <div className="flex items-center text-sm font-medium text-purple-600 group-hover:gap-2 transition-all">
                  Start Earning
                  <ArrowRight className="h-4 w-4 ml-1" />
                </div>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Onboarding Progress */}
      <OnboardingProgress
        tasks={dashboardData.onboardingTasks || []}
        completionPercentage={dashboardData.onboardingCompletionPercentage}
        loading={loading}
      />

      {/* Tools CTA Banner */}
      <ToolsCTA variant="banner" />

      {/* Metrics Grid */}
      <MetricGrid
        metrics={dashboardData.metrics || []}
        loading={loading}
        emptyMessage="Dashboard metrics will appear here once data is available."
      />

      {/* Profile & Application Stats Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Profile Statistics */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
              <Eye className="h-4 w-4 sm:h-5 sm:w-5" />
              Profile Statistics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 sm:gap-4 mb-4">
              <div className="text-center p-2 sm:p-3 bg-muted/30 rounded-lg">
                <div className="text-lg sm:text-2xl font-bold text-primary">
                  {dashboardData.profileStats?.totalViews ?? 0}
                </div>
                <div className="text-xs text-muted-foreground">Total Views</div>
              </div>
              <div className="text-center p-2 sm:p-3 bg-muted/30 rounded-lg">
                <div className="text-lg sm:text-2xl font-bold text-blue-600">
                  {dashboardData.profileStats?.viewsThisWeek ?? 0}
                </div>
                <div className="text-xs text-muted-foreground">This Week</div>
              </div>
              <div className="text-center p-2 sm:p-3 bg-muted/30 rounded-lg">
                <div className="text-lg sm:text-2xl font-bold text-green-600">
                  {dashboardData.profileStats?.viewsThisMonth ?? 0}
                </div>
                <div className="text-xs text-muted-foreground">This Month</div>
              </div>
              <div className="text-center p-2 sm:p-3 bg-muted/30 rounded-lg">
                <div
                  className={`text-lg sm:text-2xl font-bold ${(dashboardData.profileStats?.viewsChangePercentage ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`}
                >
                  {(dashboardData.profileStats?.viewsChangePercentage ?? 0) >= 0
                    ? "+"
                    : ""}
                  {dashboardData.profileStats?.viewsChangePercentage ?? 0}%
                </div>
                <div className="text-xs text-muted-foreground">Change</div>
              </div>
            </div>

            {/* Recent Viewers */}
            {dashboardData.profileStats?.recentViewers &&
              dashboardData.profileStats.recentViewers.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground">
                    Recent Viewers
                  </h4>
                  {dashboardData.profileStats.recentViewers
                    .slice(0, 3)
                    .map((viewer, index) => (
                      <div
                        key={viewer.userId || index}
                        className="flex items-center justify-between p-2 bg-muted/20 rounded"
                      >
                        <div>
                          <div className="text-sm font-medium">
                            {viewer.name}
                          </div>
                          {viewer.company && (
                            <div className="text-xs text-muted-foreground">
                              {viewer.company}
                            </div>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(viewer.viewedAt).toLocaleDateString()}
                        </div>
                      </div>
                    ))}
                </div>
              )}
          </CardContent>
        </Card>

        {/* Application Statistics */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Application Statistics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="text-center p-3 bg-muted/30 rounded-lg">
                <div className="text-2xl font-bold text-primary">
                  {dashboardData.applicationStats?.totalApplications ?? 0}
                </div>
                <div className="text-xs text-muted-foreground">
                  Total Applications
                </div>
              </div>
              <div className="text-center p-3 bg-muted/30 rounded-lg">
                <div className="text-2xl font-bold text-yellow-600">
                  {dashboardData.applicationStats?.pendingApplications ?? 0}
                </div>
                <div className="text-xs text-muted-foreground">Pending</div>
              </div>
              <div className="text-center p-3 bg-muted/30 rounded-lg">
                <div className="text-2xl font-bold text-green-600">
                  {dashboardData.applicationStats?.interviewRequests ?? 0}
                </div>
                <div className="text-xs text-muted-foreground">Interviews</div>
              </div>
              <div className="text-center p-3 bg-muted/30 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">
                  {dashboardData.applicationStats?.successRate ?? 0}%
                </div>
                <div className="text-xs text-muted-foreground">
                  Success Rate
                </div>
              </div>
            </div>

            {/* Recent Applications */}
            {dashboardData.applicationStats?.recentApplications &&
              dashboardData.applicationStats.recentApplications.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground">
                    Recent Applications
                  </h4>
                  {dashboardData.applicationStats.recentApplications
                    .slice(0, 3)
                    .map((app, index) => (
                      <div
                        key={app.applicationId || index}
                        className="flex items-center justify-between p-2 bg-muted/20 rounded"
                      >
                        <div>
                          <div className="text-sm font-medium">
                            {app.jobTitle}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {app.company}
                          </div>
                        </div>
                        <Badge
                          variant={
                            app.status === "pending"
                              ? "secondary"
                              : app.status === "accepted"
                                ? "default"
                                : "destructive"
                          }
                          className="text-xs"
                        >
                          {app.status}
                        </Badge>
                      </div>
                    ))}
                </div>
              )}
          </CardContent>
        </Card>
      </div>

      {/* Job Matches & Interviews Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Job Matches */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Job Matches
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dashboardData.jobMatches && dashboardData.jobMatches.length > 0 ? (
              <div className="space-y-3">
                {dashboardData.jobMatches.slice(0, 4).map((job, index) => (
                  <div
                    key={job.jobId || index}
                    className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
                  >
                    <div className="flex-1">
                      <div className="font-medium text-sm">{job.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {job.company} • {job.location}
                      </div>
                      {job.salary && (
                        <div className="text-xs text-green-600">
                          {job.salary}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-primary">
                        {job.matchScore}%
                      </div>
                      <div className="text-xs text-muted-foreground">Match</div>
                    </div>
                  </div>
                ))}
                <Button variant="outline" className="w-full">
                  View All Matches
                </Button>
              </div>
            ) : (
              <div className="text-center py-8">
                <Target className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  No job matches yet
                </p>
                <Button variant="outline" size="sm" className="mt-2">
                  Find Jobs
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming Interviews */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Upcoming Interviews
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dashboardData.upcomingInterviews &&
            dashboardData.upcomingInterviews.length > 0 ? (
              <div className="space-y-3">
                {dashboardData.upcomingInterviews
                  .slice(0, 4)
                  .map((interview, index) => (
                    <div
                      key={interview.id || index}
                      className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
                    >
                      <div>
                        <div className="font-medium text-sm">
                          {interview.jobTitle}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {interview.company}
                        </div>
                        <div className="text-xs text-blue-600">
                          {interview.type}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-medium">
                          {new Date(
                            interview.scheduledTime,
                          ).toLocaleDateString()}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(
                            interview.scheduledTime,
                          ).toLocaleTimeString()}
                        </div>
                        <Badge variant="secondary" className="text-xs mt-1">
                          {interview.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                <Button variant="outline" className="w-full">
                  View All Interviews
                </Button>
              </div>
            ) : (
              <div className="text-center py-8">
                <Calendar className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  No upcoming interviews
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Messages widget intentionally removed — unified into the
          CommunicationHub bell in the header. */}

      {/* Career Progress Summary */}
      {dashboardData.applicationStats && (
        <Card className="bg-gradient-to-r from-green-50 to-blue-50 border-green-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
              Career Progress Summary
            </CardTitle>
            <CardDescription>
              Your job search performance and career development metrics
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {dashboardData.applicationStats.successRate}%
                </div>
                <div className="text-xs text-muted-foreground">
                  Success Rate
                </div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {dashboardData.applicationStats.totalApplications}
                </div>
                <div className="text-xs text-muted-foreground">
                  Applications
                </div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">
                  {dashboardData.applicationStats.interviewRequests}
                </div>
                <div className="text-xs text-muted-foreground">Interviews</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">
                  {dashboardData.profileStats?.totalViews ?? 0}
                </div>
                <div className="text-xs text-muted-foreground">
                  Profile Views
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Activity */}
      <ActivityFeed
        activities={dashboardData.recentActivity || []}
        loading={loading}
        onViewAll={() => {
          /* TODO: Implement view all activity */
        }}
      />
    </div>
  );
}

export default JobSeekerDashboard;
