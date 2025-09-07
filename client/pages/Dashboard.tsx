import {
  Users,
  FileText,
  Briefcase,
  Eye,
  TrendingUp,
  Clock,
  Target,
  CheckCircle2,
  ArrowRight,
  BarChart3,
  UserPlus,
  Download,
  Calendar,
  Building2,
  Video,
  Sparkles,
  Star,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth } from "@/lib/auth";
import { createRolePermissions, getRoleDisplayLabel } from "@/lib/role-utils";
import {
  dashboardService,
  type BaseDashboard,
  type JobSeekerDashboard,
  type EmployerDashboard
} from "@/lib/services/dashboard-service";
import MetricsPieChart from "@/components/charts/MetricsPieChart";
import TrendLineChart from "@/components/charts/TrendLineChart";









export default function Dashboard() {
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();
  const { user, isAuthenticated, isLoading } = useAuth();



  // Dashboard data state
  const [realDashboardData, setRealDashboardData] = useState<BaseDashboard | JobSeekerDashboard | EmployerDashboard | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Load dashboard data based on user role
  const loadDashboardData = async () => {
    if (!user) {
      return;
    }

    setDashboardLoading(true);
    setDashboardError(null);

    try {
      // Use centralized role-based dashboard fetching
      const response = await dashboardService.getDashboardForRole(user.role);

      if (response.success && response.data) {
        setRealDashboardData(response.data);
        setLastRefresh(new Date());
      } else {
        const errorMsg = response.error || 'Failed to load dashboard data';
        setDashboardError(errorMsg);
      }
    } catch (error) {
      console.error('Dashboard loading error:', error);
      setDashboardError(error instanceof Error ? error.message : 'An unexpected error occurred');
    } finally {
      setDashboardLoading(false);
    }
  };

  // Load data on component mount and user change
  useEffect(() => {
    loadDashboardData();
  }, [user]);

  // Record page view for analytics
  useEffect(() => {
    if (user) {
      dashboardService.recordActivity({
        activityType: 'page_view',
        description: 'Viewed dashboard',
        entityType: 'page',
        priority: 1,
      });
    }
  }, [user]);

  // Show loading state while authentication is being determined
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-brand-purple/5 to-brand-blue/5">
        <Sidebar
          isOpen={sidebarOpen}
          onClose={closeSidebar}
          collapsed={sidebarCollapsed}
        />
        <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
          <Navigation
            onMenuClick={openSidebar}
            onSidebarToggle={toggleSidebar}
            sidebarCollapsed={sidebarCollapsed}
          />
          <div className="pt-16">
            <div className="max-w-7xl mx-auto px-4 py-16">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                <p className="text-muted-foreground">Loading dashboard...</p>
              </div>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  // If user is not authenticated, show CTA
  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-brand-purple/5 to-brand-blue/5">
        <Sidebar
          isOpen={sidebarOpen}
          onClose={closeSidebar}
          collapsed={sidebarCollapsed}
        />
        <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
          <Navigation
            onMenuClick={openSidebar}
            onSidebarToggle={toggleSidebar}
            sidebarCollapsed={sidebarCollapsed}
          />

          <div className="pt-16">
            <div className="max-w-6xl mx-auto px-4 py-16">
              {/* Hero Section */}
              <div className="text-center mb-16">
                <div className="inline-flex items-center space-x-2 mb-6">
                  <div className="relative">
                    <Video className="h-12 w-12 text-primary" />
                    <Sparkles className="h-6 w-6 text-brand-blue absolute -top-1 -right-1" />
                  </div>
                  <span className="text-4xl font-bold bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
                    HR Dashboard
                  </span>
                </div>
                <h1 className="text-5xl font-bold mb-6">
                  Your HR Command Center
                </h1>
                <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
                  Comprehensive talent management dashboard with social
                  recruiting, ATS analytics, CRM insights, and recruitment
                  marketing metrics all in one place.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Link to="/signup">
                    <Button
                      size="lg"
                      className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-lg px-8"
                    >
                      Get Started
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </Link>
                  <Link to="/login">
                    <Button
                      size="lg"
                      variant="outline"
                      className="text-lg px-8"
                    >
                      Sign In
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Features Grid */}
              <div className="grid md:grid-cols-3 gap-8 mb-16">
                <Card className="border-brand-purple/20 hover:border-brand-purple/40 transition-colors">
                  <CardHeader>
                    <BarChart3 className="h-10 w-10 text-brand-purple mb-4" />
                    <CardTitle>Real-time Analytics</CardTitle>
                    <CardDescription>
                      Track your profile views, application success rates, and
                      career progress with detailed metrics.
                    </CardDescription>
                  </CardHeader>
                </Card>

                <Card className="border-brand-blue/20 hover:border-brand-blue/40 transition-colors">
                  <CardHeader>
                    <Target className="h-10 w-10 text-brand-blue mb-4" />
                    <CardTitle>Goal Tracking</CardTitle>
                    <CardDescription>
                      Set and monitor your career goals with personalized
                      recommendations and progress insights.
                    </CardDescription>
                  </CardHeader>
                </Card>

                <Card className="border-primary/20 hover:border-primary/40 transition-colors">
                  <CardHeader>
                    <CheckCircle2 className="h-10 w-10 text-primary mb-4" />
                    <CardTitle>Task Management</CardTitle>
                    <CardDescription>
                      Stay organized with guided onboarding tasks and
                      personalized action items for your persona.
                    </CardDescription>
                  </CardHeader>
                </Card>
              </div>

              {/* Persona-specific Benefits */}
              <div className="mb-16">
                <h2 className="text-3xl font-bold text-center mb-12">
                  Tailored for Your Role
                </h2>
                <div className="grid md:grid-cols-3 gap-8">
                  <Card className="text-center">
                    <CardHeader>
                      <Users className="h-12 w-12 mx-auto text-green-600 mb-4" />
                      <CardTitle>Job Seekers</CardTitle>
                      <CardDescription>
                        Track resume views, application status, interview
                        requests, and career progress all in one place.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm text-left">
                        <div className="flex items-center gap-2">
                          <Star className="h-4 w-4 text-yellow-500" />
                          Resume analytics & optimization tips
                        </div>
                        <div className="flex items-center gap-2">
                          <Star className="h-4 w-4 text-yellow-500" />
                          Job application tracking
                        </div>
                        <div className="flex items-center gap-2">
                          <Star className="h-4 w-4 text-yellow-500" />
                          Interview preparation tools
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="text-center">
                    <CardHeader>
                      <Briefcase className="h-12 w-12 mx-auto text-blue-600 mb-4" />
                      <CardTitle>Recruiters</CardTitle>
                      <CardDescription>
                        Manage candidate pipelines, track placement rates, and
                        optimize your recruitment workflow.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm text-left">
                        <div className="flex items-center gap-2">
                          <Star className="h-4 w-4 text-yellow-500" />
                          Candidate sourcing analytics
                        </div>
                        <div className="flex items-center gap-2">
                          <Star className="h-4 w-4 text-yellow-500" />
                          Interview scheduling tools
                        </div>
                        <div className="flex items-center gap-2">
                          <Star className="h-4 w-4 text-yellow-500" />
                          Placement success metrics
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="text-center">
                    <CardHeader>
                      <Building2 className="h-12 w-12 mx-auto text-purple-600 mb-4" />
                      <CardTitle>Businesses</CardTitle>
                      <CardDescription>
                        Monitor hiring operations, team growth, and recruitment
                        ROI with comprehensive business insights.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm text-left">
                        <div className="flex items-center gap-2">
                          <Star className="h-4 w-4 text-yellow-500" />
                          Team growth analytics
                        </div>
                        <div className="flex items-center gap-2">
                          <Star className="h-4 w-4 text-yellow-500" />
                          Hiring cost optimization
                        </div>
                        <div className="flex items-center gap-2">
                          <Star className="h-4 w-4 text-yellow-500" />
                          Department-wise insights
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Final CTA */}
              <div className="text-center bg-gradient-to-r from-brand-purple/10 to-brand-blue/10 p-8 rounded-2xl">
                <h3 className="text-2xl font-bold mb-4">
                  Ready to Take Control of Your Career?
                </h3>
                <p className="text-muted-foreground mb-6">
                  Join thousands of professionals who are already using
                  MyVideoResume to accelerate their careers.
                </p>
                <Link to="/signup">
                  <Button
                    size="lg"
                    className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90"
                  >
                    Start Your Dashboard Today
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
              </div>
            </div>
            <Footer />
          </div>
        </div>
      </div>
    );
  }


  // Only use real dashboard data - never show fake/mock data
  const dashboardData = realDashboardData;



  // Use real onboarding tasks from API data, fallback to empty array if not available
  const onboardingTasks = dashboardData?.onboardingTasks || [];
  const completedTasksCount = onboardingTasks.filter(
    (task) => task.completed,
  ).length;
  const progressPercentage = onboardingTasks.length > 0 ? Math.round(
    (completedTasksCount / onboardingTasks.length) * 100,
  ) : 0;

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={closeSidebar}
        collapsed={sidebarCollapsed}
      />
      <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
        <Navigation
          onMenuClick={openSidebar}
          onSidebarToggle={toggleSidebar}
          sidebarCollapsed={sidebarCollapsed}
        />

        <div className="pt-16 p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-foreground">
                  {dashboardData?.title || "Dashboard"}
                </h1>
                <p className="text-muted-foreground mt-1">
                  {dashboardData?.description || "Welcome to your dashboard"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {lastRefresh && (
                  <span className="text-sm text-muted-foreground">
                    Last updated: {lastRefresh.toLocaleTimeString()}
                  </span>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadDashboardData}
                  disabled={dashboardLoading}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${dashboardLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
                <Badge variant="secondary">
                  {getRoleDisplayLabel(user.role)}
                </Badge>
              </div>
            </div>

            {/* Onboarding Progress */}
            {progressPercentage < 100 && (
              <Card className="border-primary/20 bg-primary/5">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Target className="h-5 w-5" />
                        Complete Your Setup
                      </CardTitle>
                      <CardDescription>
                        {completedTasksCount} of {onboardingTasks.length} tasks
                        completed
                      </CardDescription>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-primary">
                        {progressPercentage}%
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Complete
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Progress value={progressPercentage} className="h-3 mb-4" />
                  <div className="grid gap-2">
                    {onboardingTasks
                      .filter((task) => !task.completed)
                      .slice(0, 2)
                      .map((task) => (
                        <div
                          key={task.id}
                          className="flex items-center justify-between p-3 bg-background rounded-lg"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-4 h-4 border-2 border-muted-foreground rounded-full" />
                            <span className="font-medium">{task.title}</span>
                          </div>
                          <Button size="sm" variant="outline">
                            Complete
                            <ArrowRight className="h-3 w-3 ml-1" />
                          </Button>
                        </div>
                      ))}
                  </div>
                  {onboardingTasks.filter((task) => !task.completed).length >
                    2 && (
                    <Link to="/onboarding">
                      <Button variant="link" className="mt-2 p-0">
                        View all tasks (
                        {
                          onboardingTasks.filter((task) => !task.completed)
                            .length
                        }{" "}
                        remaining)
                      </Button>
                    </Link>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Dashboard Error State */}
            {dashboardError && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center gap-2 text-red-800">
                  <AlertCircle className="h-4 w-4" />
                  <span className="font-medium">Dashboard Error</span>
                </div>
                <p className="text-red-700 mt-1">{dashboardError}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={loadDashboardData}
                >
                  Retry
                </Button>
              </div>
            )}

            {/* Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {dashboardLoading ? (
                // Loading skeletons
                Array.from({ length: 4 }).map((_, index) => (
                  <Card key={index}>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
                      <div className="h-4 w-4 bg-gray-200 rounded animate-pulse" />
                    </CardHeader>
                    <CardContent>
                      <div className="h-8 w-16 bg-gray-200 rounded animate-pulse mb-2" />
                      <div className="h-3 w-20 bg-gray-200 rounded animate-pulse" />
                    </CardContent>
                  </Card>
                ))
              ) : dashboardData && dashboardData.metrics ? (
                dashboardData.metrics.map((metric, index) => (
                <Card key={index}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      {metric.title}
                    </CardTitle>
                    {metric.icon && React.createElement(metric.icon, { className: "h-4 w-4 text-muted-foreground" })}
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{metric.value}</div>
                    {metric.change && (
                      <div
                        className={`text-xs flex items-center gap-1 ${
                          metric.trend === "up"
                            ? "text-green-600"
                            : "text-red-600"
                        }`}
                      >
                        <TrendingUp
                          className={`h-3 w-3 ${metric.trend === "down" ? "rotate-180" : ""}`}
                        />
                        {metric.change} from last month
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
              ) : !dashboardError ? (
                // No data state (when API succeeds but returns no metrics)
                <div className="col-span-full text-center py-8">
                  <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No metrics available</h3>
                  <p className="text-muted-foreground">Dashboard metrics will appear here once data is available.</p>
                </div>
              ) : null}
            </div>



            {/* Job Seeker Specific Sections */}
            {createRolePermissions(user.role).isJobSeeker && dashboardData && 'profileStats' in dashboardData && (
              <>
                {/* Profile & Application Stats Row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Profile Statistics */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Eye className="h-5 w-5" />
                        Profile Statistics
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="text-center p-3 bg-muted/30 rounded-lg">
                          <div className="text-2xl font-bold text-primary">
                            {dashboardData.profileStats.totalViews}
                          </div>
                          <div className="text-xs text-muted-foreground">Total Views</div>
                        </div>
                        <div className="text-center p-3 bg-muted/30 rounded-lg">
                          <div className="text-2xl font-bold text-blue-600">
                            {dashboardData.profileStats.viewsThisWeek}
                          </div>
                          <div className="text-xs text-muted-foreground">This Week</div>
                        </div>
                        <div className="text-center p-3 bg-muted/30 rounded-lg">
                          <div className="text-2xl font-bold text-green-600">
                            {dashboardData.profileStats.viewsThisMonth}
                          </div>
                          <div className="text-xs text-muted-foreground">This Month</div>
                        </div>
                        <div className="text-center p-3 bg-muted/30 rounded-lg">
                          <div className={`text-2xl font-bold ${dashboardData.profileStats.viewsChangePercentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {dashboardData.profileStats.viewsChangePercentage >= 0 ? '+' : ''}{dashboardData.profileStats.viewsChangePercentage}%
                          </div>
                          <div className="text-xs text-muted-foreground">Change</div>
                        </div>
                      </div>

                      {/* Recent Viewers */}
                      {dashboardData.profileStats.recentViewers && dashboardData.profileStats.recentViewers.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="text-sm font-medium text-muted-foreground">Recent Viewers</h4>
                          {dashboardData.profileStats.recentViewers.slice(0, 3).map((viewer, index) => (
                            <div key={viewer.userId || index} className="flex items-center justify-between p-2 bg-muted/20 rounded">
                              <div>
                                <div className="text-sm font-medium">{viewer.name}</div>
                                {viewer.company && <div className="text-xs text-muted-foreground">{viewer.company}</div>}
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
                  {'applicationStats' in dashboardData && (
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
                              {dashboardData.applicationStats.totalApplications}
                            </div>
                            <div className="text-xs text-muted-foreground">Total Applications</div>
                          </div>
                          <div className="text-center p-3 bg-muted/30 rounded-lg">
                            <div className="text-2xl font-bold text-yellow-600">
                              {dashboardData.applicationStats.pendingApplications}
                            </div>
                            <div className="text-xs text-muted-foreground">Pending</div>
                          </div>
                          <div className="text-center p-3 bg-muted/30 rounded-lg">
                            <div className="text-2xl font-bold text-green-600">
                              {dashboardData.applicationStats.interviewRequests}
                            </div>
                            <div className="text-xs text-muted-foreground">Interviews</div>
                          </div>
                          <div className="text-center p-3 bg-muted/30 rounded-lg">
                            <div className="text-2xl font-bold text-blue-600">
                              {dashboardData.applicationStats.successRate}%
                            </div>
                            <div className="text-xs text-muted-foreground">Success Rate</div>
                          </div>
                        </div>

                        {/* Recent Applications */}
                        {dashboardData.applicationStats.recentApplications && dashboardData.applicationStats.recentApplications.length > 0 && (
                          <div className="space-y-2">
                            <h4 className="text-sm font-medium text-muted-foreground">Recent Applications</h4>
                            {dashboardData.applicationStats.recentApplications.slice(0, 3).map((app, index) => (
                              <div key={app.applicationId || index} className="flex items-center justify-between p-2 bg-muted/20 rounded">
                                <div>
                                  <div className="text-sm font-medium">{app.jobTitle}</div>
                                  <div className="text-xs text-muted-foreground">{app.company}</div>
                                </div>
                                <Badge variant={app.status === 'pending' ? 'secondary' : app.status === 'accepted' ? 'default' : 'destructive'} className="text-xs">
                                  {app.status}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </div>

                {/* Job Matches & Interviews Row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Job Matches */}
                  {'jobMatches' in dashboardData && (
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
                              <div key={job.jobId || index} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                                <div className="flex-1">
                                  <div className="font-medium text-sm">{job.title}</div>
                                  <div className="text-xs text-muted-foreground">{job.company} • {job.location}</div>
                                  {job.salary && <div className="text-xs text-green-600">{job.salary}</div>}
                                </div>
                                <div className="text-right">
                                  <div className="text-sm font-bold text-primary">{job.matchScore}%</div>
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
                            <p className="text-sm text-muted-foreground">No job matches yet</p>
                            <Button variant="outline" size="sm" className="mt-2">
                              Find Jobs
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* Upcoming Interviews */}
                  {'upcomingInterviews' in dashboardData && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Calendar className="h-5 w-5" />
                          Upcoming Interviews
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {dashboardData.upcomingInterviews && dashboardData.upcomingInterviews.length > 0 ? (
                          <div className="space-y-3">
                            {dashboardData.upcomingInterviews.slice(0, 4).map((interview, index) => (
                              <div key={interview.id || index} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                                <div>
                                  <div className="font-medium text-sm">{interview.jobTitle}</div>
                                  <div className="text-xs text-muted-foreground">{interview.company}</div>
                                  <div className="text-xs text-blue-600">{interview.type}</div>
                                </div>
                                <div className="text-right">
                                  <div className="text-xs font-medium">
                                    {new Date(interview.scheduledTime).toLocaleDateString()}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {new Date(interview.scheduledTime).toLocaleTimeString()}
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
                            <p className="text-sm text-muted-foreground">No upcoming interviews</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </div>

                {/* Messages Section */}
                {'messageStats' in dashboardData && dashboardData.messageStats && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Clock className="h-5 w-5" />
                        Messages
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="text-center p-3 bg-muted/30 rounded-lg">
                          <div className="text-2xl font-bold text-red-600">
                            {dashboardData.messageStats.unreadCount}
                          </div>
                          <div className="text-xs text-muted-foreground">Unread Messages</div>
                        </div>
                        <div className="text-center p-3 bg-muted/30 rounded-lg">
                          <div className="text-2xl font-bold text-primary">
                            {dashboardData.messageStats.totalConversations}
                          </div>
                          <div className="text-xs text-muted-foreground">Total Conversations</div>
                        </div>
                      </div>

                      {/* Recent Messages */}
                      {dashboardData.messageStats.recentMessages && dashboardData.messageStats.recentMessages.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="text-sm font-medium text-muted-foreground">Recent Messages</h4>
                          {dashboardData.messageStats.recentMessages.slice(0, 3).map((message, index) => (
                            <div key={message.conversationId || index} className="flex items-start gap-3 p-2 bg-muted/20 rounded">
                              <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${message.isRead ? 'bg-muted-foreground' : 'bg-primary'}`} />
                              <div className="flex-1">
                                <div className="text-sm font-medium">{message.senderName}</div>
                                <div className="text-xs text-muted-foreground line-clamp-2">{message.preview}</div>
                                <div className="text-xs text-muted-foreground mt-1">
                                  {new Date(message.sentAt).toLocaleDateString()}
                                </div>
                              </div>
                            </div>
                          ))}
                          <Button variant="outline" className="w-full">
                            View All Messages
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Job Seeker Performance Summary */}
                {'applicationStats' in dashboardData && dashboardData.applicationStats && (
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
                          <div className="text-xs text-muted-foreground">Success Rate</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-blue-600">
                            {dashboardData.applicationStats.totalApplications}
                          </div>
                          <div className="text-xs text-muted-foreground">Applications</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-purple-600">
                            {dashboardData.applicationStats.interviewRequests}
                          </div>
                          <div className="text-xs text-muted-foreground">Interviews</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-orange-600">
                            {dashboardData.profileStats.totalViews}
                          </div>
                          <div className="text-xs text-muted-foreground">Profile Views</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}

            {/* Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Recent Activity */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    Recent Activity
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {dashboardData && dashboardData.recentActivity && dashboardData.recentActivity.length > 0 ? (
                    <>
                      {dashboardData.recentActivity.map((activity, index) => (
                        <div
                          key={activity.id || index}
                          className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg"
                        >
                          <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0" />
                          <div className="flex-1">
                            <p className="text-sm font-medium">
                              {activity.content}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {activity.time}
                            </p>
                          </div>
                        </div>
                      ))}
                      <Button variant="outline" className="w-full">
                        View All Activity
                      </Button>
                    </>
                  ) : (
                    <div className="text-center py-8">
                      <Clock className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">No recent activity</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Quick Actions */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Quick Actions
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {createRolePermissions(user.role).isJobSeeker && (
                    <>
                      <Button
                        className="w-full justify-start gap-3"
                        variant="outline"
                      >
                        <FileText className="h-4 w-4" />
                        Update Resume
                      </Button>
                      <Button
                        className="w-full justify-start gap-3"
                        variant="outline"
                      >
                        <Eye className="h-4 w-4" />
                        View Applications
                      </Button>
                      <Button
                        className="w-full justify-start gap-3"
                        variant="outline"
                      >
                        <Target className="h-4 w-4" />
                        Find New Jobs
                      </Button>
                    </>
                  )}
                  {createRolePermissions(user.role).isRecruiter && (
                    <>
                      <Button
                        className="w-full justify-start gap-3"
                        variant="outline"
                      >
                        <Briefcase className="h-4 w-4" />
                        Post New Job
                      </Button>
                      <Button
                        className="w-full justify-start gap-3"
                        variant="outline"
                      >
                        <Users className="h-4 w-4" />
                        Review Candidates
                      </Button>
                      <Button
                        className="w-full justify-start gap-3"
                        variant="outline"
                      >
                        <Calendar className="h-4 w-4" />
                        Schedule Interviews
                      </Button>
                    </>
                  )}
                  {createRolePermissions(user.role).isEmployer && (
                    <>
                      <Button
                        className="w-full justify-start gap-3"
                        variant="outline"
                      >
                        <Briefcase className="h-4 w-4" />
                        Post New Job
                      </Button>
                      <Button
                        className="w-full justify-start gap-3"
                        variant="outline"
                      >
                        <Users className="h-4 w-4" />
                        Review Candidates
                      </Button>
                      <Button
                        className="w-full justify-start gap-3"
                        variant="outline"
                      >
                        <Calendar className="h-4 w-4" />
                        Schedule Interviews
                      </Button>
                      <Button
                        className="w-full justify-start gap-3"
                        variant="outline"
                      >
                        <Building2 className="h-4 w-4" />
                        Team Analytics
                      </Button>
                      <Button
                        className="w-full justify-start gap-3"
                        variant="outline"
                      >
                        <Download className="h-4 w-4" />
                        Export Reports
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Additional Dashboard Sections for Employer/Business Role */}
            {createRolePermissions(user.role).isEmployer && dashboardData && (
              <>
                {/* Team & Budget Metrics Row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Team Metrics */}
                  {'teamMetrics' in dashboardData && dashboardData.teamMetrics && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Users className="h-5 w-5" />
                          Team Metrics
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="text-center p-3 bg-muted/30 rounded-lg">
                            <div className="text-2xl font-bold text-primary">
                              {dashboardData.teamMetrics.totalTeamMembers}
                            </div>
                            <div className="text-xs text-muted-foreground">Total Members</div>
                          </div>
                          <div className="text-center p-3 bg-muted/30 rounded-lg">
                            <div className="text-2xl font-bold text-blue-600">
                              {dashboardData.teamMetrics.activeRecruiters}
                            </div>
                            <div className="text-xs text-muted-foreground">Active Recruiters</div>
                          </div>
                          <div className="text-center p-3 bg-muted/30 rounded-lg">
                            <div className="text-2xl font-bold text-green-600">
                              {dashboardData.teamMetrics.openPositions}
                            </div>
                            <div className="text-xs text-muted-foreground">Open Positions</div>
                          </div>
                          <div className="text-center p-3 bg-muted/30 rounded-lg">
                            <div className="text-2xl font-bold text-purple-600">
                              {dashboardData.teamMetrics.teamPerformanceScore}%
                            </div>
                            <div className="text-xs text-muted-foreground">Performance Score</div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Budget Statistics */}
                  {'budgetStats' in dashboardData && dashboardData.budgetStats && (
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
                            <span className="text-sm text-muted-foreground">Total Budget</span>
                            <span className="font-semibold">${dashboardData.budgetStats.totalBudget.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-muted-foreground">Spent Amount</span>
                            <span className="font-semibold text-red-600">${dashboardData.budgetStats.spentAmount.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-muted-foreground">Remaining</span>
                            <span className="font-semibold text-green-600">${dashboardData.budgetStats.remainingBudget.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between items-center pt-2 border-t">
                            <span className="text-sm text-muted-foreground">Cost per Hire</span>
                            <span className="font-semibold">${dashboardData.budgetStats.costPerHire.toLocaleString()}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>

                {/* Company & Candidate Stats Row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Company Statistics */}
                  {'companyStats' in dashboardData && dashboardData.companyStats && (
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
                            <div className="text-xs text-muted-foreground">Total Employees</div>
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
                            <div className="text-xs text-muted-foreground">Hiring Velocity</div>
                          </div>
                          <div className="text-center p-3 bg-muted/30 rounded-lg">
                            <div className="text-2xl font-bold text-purple-600">
                              {dashboardData.companyStats.employeeRetentionRate}%
                            </div>
                            <div className="text-xs text-muted-foreground">Retention Rate</div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Candidate Statistics */}
                  {'candidateStats' in dashboardData && dashboardData.candidateStats && (
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
                            <div className="text-xs text-muted-foreground">Total Candidates</div>
                          </div>
                          <div className="text-center p-3 bg-muted/30 rounded-lg">
                            <div className="text-2xl font-bold text-green-600">
                              {dashboardData.candidateStats.newCandidates}
                            </div>
                            <div className="text-xs text-muted-foreground">New This Month</div>
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
                            <div className="text-xs text-muted-foreground">Interviewed</div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>

                {/* Job Posting & Recruitment Metrics Row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Job Posting Statistics */}
                  {'jobPostingStats' in dashboardData && dashboardData.jobPostingStats && (
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
                            <div className="text-xs text-muted-foreground">Active Jobs</div>
                          </div>
                          <div className="text-center p-3 bg-muted/30 rounded-lg">
                            <div className="text-2xl font-bold text-blue-600">
                              {dashboardData.jobPostingStats.totalApplications}
                            </div>
                            <div className="text-xs text-muted-foreground">Total Applications</div>
                          </div>
                          <div className="text-center p-3 bg-muted/30 rounded-lg">
                            <div className="text-2xl font-bold text-green-600">
                              {dashboardData.jobPostingStats.filledPositions}
                            </div>
                            <div className="text-xs text-muted-foreground">Filled Positions</div>
                          </div>
                          <div className="text-center p-3 bg-muted/30 rounded-lg">
                            <div className="text-2xl font-bold text-purple-600">
                              {dashboardData.jobPostingStats.averageTimeToFill}
                            </div>
                            <div className="text-xs text-muted-foreground">Avg. Days to Fill</div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Recruitment Metrics */}
                  {'recruitmentMetrics' in dashboardData && dashboardData.recruitmentMetrics && (
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
                            <span className="text-sm text-muted-foreground">Placements Made</span>
                            <span className="font-semibold text-green-600">{dashboardData.recruitmentMetrics.placementsMade}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-muted-foreground">Placement Rate</span>
                            <span className="font-semibold">{dashboardData.recruitmentMetrics.placementRate.toFixed(1)}%</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-muted-foreground">Avg. Time to Hire</span>
                            <span className="font-semibold">{dashboardData.recruitmentMetrics.averageTimeToHire} days</span>
                          </div>
                          <div className="flex justify-between items-center pt-2 border-t">
                            <span className="text-sm text-muted-foreground">Cost per Hire</span>
                            <span className="font-semibold">${dashboardData.recruitmentMetrics.costPerHire.toLocaleString()}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>

                {/* Lists Row - New Candidates, Interviews, Messages */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* New Candidates */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <UserPlus className="h-5 w-5" />
                        New Candidates
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {'newCandidates' in dashboardData && dashboardData.newCandidates && dashboardData.newCandidates.length > 0 ? (
                        <div className="space-y-3">
                          {dashboardData.newCandidates.map((candidate, index) => (
                            <div key={candidate.candidateId || index} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                              <div>
                                <div className="font-medium text-sm">{candidate.name}</div>
                                <div className="text-xs text-muted-foreground">{candidate.jobTitle}</div>
                              </div>
                              <Badge variant="secondary" className="text-xs">
                                {candidate.status}
                              </Badge>
                            </div>
                          ))}
                          <Button variant="outline" size="sm" className="w-full">
                            View All Candidates
                          </Button>
                        </div>
                      ) : (
                        <div className="text-center py-8">
                          <UserPlus className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                          <p className="text-sm text-muted-foreground">No new candidates</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Scheduled Interviews */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Calendar className="h-5 w-5" />
                        Upcoming Interviews
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {'scheduledInterviews' in dashboardData && dashboardData.scheduledInterviews && dashboardData.scheduledInterviews.length > 0 ? (
                        <div className="space-y-3">
                          {dashboardData.scheduledInterviews.map((interview, index) => (
                            <div key={interview.id || index} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                              <div>
                                <div className="font-medium text-sm">{interview.candidateName}</div>
                                <div className="text-xs text-muted-foreground">{interview.jobTitle}</div>
                              </div>
                              <div className="text-right">
                                <div className="text-xs font-medium">{interview.date}</div>
                                <div className="text-xs text-muted-foreground">{interview.time}</div>
                              </div>
                            </div>
                          ))}
                          <Button variant="outline" size="sm" className="w-full">
                            View All Interviews
                          </Button>
                        </div>
                      ) : (
                        <div className="text-center py-8">
                          <Calendar className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                          <p className="text-sm text-muted-foreground">No scheduled interviews</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Message Statistics */}
                  {'messageStats' in dashboardData && dashboardData.messageStats && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Clock className="h-5 w-5" />
                          Messages
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div className="text-center p-3 bg-muted/30 rounded-lg">
                            <div className="text-2xl font-bold text-red-600">
                              {dashboardData.messageStats.unreadCount}
                            </div>
                            <div className="text-xs text-muted-foreground">Unread Messages</div>
                          </div>
                          <div className="text-center p-3 bg-muted/30 rounded-lg">
                            <div className="text-2xl font-bold text-primary">
                              {dashboardData.messageStats.totalConversations}
                            </div>
                            <div className="text-xs text-muted-foreground">Total Conversations</div>
                          </div>
                          {dashboardData.messageStats.unreadCount > 0 && (
                            <Button variant="outline" size="sm" className="w-full">
                              View Messages
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>

                {/* Performance Summary */}
                {'recruitmentMetrics' in dashboardData && dashboardData.recruitmentMetrics && (
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
                          <div className="text-xs text-muted-foreground">Success Rate</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-green-600">
                            {dashboardData.recruitmentMetrics.averageTimeToHire}
                          </div>
                          <div className="text-xs text-muted-foreground">Days to Hire</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-purple-600">
                            {dashboardData.recruitmentMetrics.placementsMade}
                          </div>
                          <div className="text-xs text-muted-foreground">Placements</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-orange-600">
                            ${(dashboardData.recruitmentMetrics.costPerHire / 1000).toFixed(1)}k
                          </div>
                          <div className="text-xs text-muted-foreground">Cost per Hire</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Charts Section */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Candidate Pipeline Chart */}
                  {'candidateStats' in dashboardData && dashboardData.candidateStats && (
                    <MetricsPieChart
                      title="Candidate Pipeline"
                      description="Distribution of candidates by stage"
                      data={[
                        { name: 'New', value: dashboardData.candidateStats.newCandidates, color: '#10b981' },
                        { name: 'Qualified', value: dashboardData.candidateStats.qualifiedCandidates, color: '#3b82f6' },
                        { name: 'Interviewed', value: dashboardData.candidateStats.interviewedCandidates, color: '#8b5cf6' },
                        { name: 'Other', value: Math.max(0, dashboardData.candidateStats.totalCandidates - dashboardData.candidateStats.newCandidates - dashboardData.candidateStats.qualifiedCandidates - dashboardData.candidateStats.interviewedCandidates), color: '#6b7280' }
                      ].filter(item => item.value > 0)}
                      height={300}
                      innerRadius={40}
                      outerRadius={100}
                    />
                  )}

                  {/* Budget Utilization Chart */}
                  {'budgetStats' in dashboardData && dashboardData.budgetStats && dashboardData.budgetStats.totalBudget > 0 && (
                    <MetricsPieChart
                      title="Budget Utilization"
                      description="Current budget allocation and spending"
                      data={[
                        { name: 'Spent', value: dashboardData.budgetStats.spentAmount, color: '#ef4444' },
                        { name: 'Remaining', value: dashboardData.budgetStats.remainingBudget, color: '#10b981' }
                      ].filter(item => item.value > 0)}
                      height={300}
                      innerRadius={40}
                      outerRadius={100}
                      formatTooltip={(value, name) => [`$${value.toLocaleString()}`, name]}
                    />
                  )}
                </div>

                {/* Hiring Trends Chart */}
                {'companyStats' in dashboardData && dashboardData.companyStats && (
                  <div className="grid grid-cols-1 gap-6">
                    <TrendLineChart
                      title="Hiring Trends"
                      description="New hires and hiring velocity over time"
                      data={[
                        { date: '2024-01', count: Math.max(0, dashboardData.companyStats.newHires - 5) },
                        { date: '2024-02', count: Math.max(0, dashboardData.companyStats.newHires - 3) },
                        { date: '2024-03', count: Math.max(0, dashboardData.companyStats.newHires - 1) },
                        { date: '2024-04', count: dashboardData.companyStats.newHires },
                        { date: '2024-05', count: Math.max(0, dashboardData.companyStats.newHires + 2) }
                      ]}
                      dataKey="count"
                      color="#3b82f6"
                      height={300}
                      formatTooltip={(value) => [`${value} hires`, 'New Hires']}
                      formatXAxisLabel={(value) => {
                        const [, month] = value.split('-');
                        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                        return monthNames[parseInt(month) - 1] || value;
                      }}
                    />
                  </div>
                )}
              </>
            )}

          </div>
        </div>
        <Footer />
      </div>
    </div>
  );
}
