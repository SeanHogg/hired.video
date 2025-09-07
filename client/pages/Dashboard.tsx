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
import {
  dashboardService,
  type BaseDashboard
} from "@/lib/services/dashboard-service";









export default function Dashboard() {
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();
  const { user, isAuthenticated } = useAuth();



  // Dashboard data state
  const [realDashboardData, setRealDashboardData] = useState<BaseDashboard | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Load dashboard data based on user role
  const loadDashboardData = async () => {
    if (!user) return;

    setDashboardLoading(true);
    setDashboardError(null);

    try {
      let response: any;
      const userRole = user.role?.toLowerCase().replace('_', '');

      switch (userRole) {
        case 'jobseeker':
          response = await dashboardService.getJobSeekerDashboard();
          break;
        case 'recruiter':
          response = await dashboardService.getRecruiterDashboard();
          break;
        case 'employer':
        case 'business':
          response = await dashboardService.getEmployerDashboard();
          break;
        case 'admin':
          response = await dashboardService.getAdminDashboard();
          break;
        default:
          response = await dashboardService.getDashboard();
      }

      if (response.success && response.data) {
        setRealDashboardData(response.data);
        setLastRefresh(new Date());
      } else {
        setDashboardError(response.error || 'Failed to load dashboard data');
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
                  {dashboardData.title}
                </h1>
                <p className="text-muted-foreground mt-1">
                  {dashboardData.description}
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
                <Badge variant="secondary" className="capitalize">
                  {user.role?.replace("_", " ")}
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
                  {user.role === "JobSeeker" && (
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
                  {user.role === "Recruiter" && (
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
                  {user.role === "Employer" && (
                    <>
                      <Button
                        className="w-full justify-start gap-3"
                        variant="outline"
                      >
                        <Building2 className="h-4 w-4" />
                        View Team Analytics
                      </Button>
                      <Button
                        className="w-full justify-start gap-3"
                        variant="outline"
                      >
                        <UserPlus className="h-4 w-4" />
                        Invite Team Members
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


          </div>
        </div>
        <Footer />
      </div>
    </div>
  );
}
