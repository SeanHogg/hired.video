import React, { useEffect, useState } from "react";
import {
  AlertCircle,
  RefreshCw,
  TrendingUp,
  Video as VideoIcon,
  Users,
  Briefcase,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { Link } from "react-router-dom";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import { useAI } from "@/lib/ai-context";
import { createDashboardContext } from "@/lib/utils/ai-context-helpers";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth } from "@/lib/auth";
import { createRolePermissions } from "@/lib/role-utils";
import useDashboard from "@/hooks/dashboard/useDashboard";

// Role-specific dashboard components
import JobSeekerDashboard from "@/components/dashboard/JobSeekerDashboard";
import RecruiterDashboard from "@/components/dashboard/RecruiterDashboard";
import EmployerDashboard from "@/components/dashboard/EmployerDashboard";
import AdminDashboard from "@/components/dashboard/AdminDashboard";

export default function Dashboard() {
  const [testMessage, setTestMessage] = useState<string>("useEffect NOT run yet");

  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();
  const { user, isAuthenticated, isLoading } = useAuth();
  const { setPageContext } = useAI();

  // Use custom dashboard hook for data management
  const {
    dashboardData,
    loading: dashboardLoading,
    error: dashboardError,
    lastRefresh,
    refreshDashboard,
  } = useDashboard();

  // TEST 3: Can we set the context?
  useEffect(() => {
    try {
      const context = createDashboardContext(undefined, undefined, "guest");
      setPageContext(context);
      setTestMessage("✅ TEST 3 PASSED: setPageContext(context) worked!");
    } catch (error) {
      setTestMessage(`❌ TEST 3 FAILED: ${error}`);
    }
  }, [setPageContext]);

  // Get role permissions for routing
  const rolePermissions = createRolePermissions(user?.role);

  // Dashboard wrapper component
  const DashboardWrapper: React.FC<{ children: React.ReactNode }> = ({
    children,
  }) => (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">{dashboardData?.title}</h1>
        <p className="text-muted-foreground">{dashboardData?.description}</p>
        <div className="bg-yellow-100 border border-yellow-400 text-yellow-800 px-4 py-2 rounded mt-2">
          TEST: {testMessage}
        </div>
        {lastRefresh && (
          <p className="text-xs text-muted-foreground mt-2">
            Last updated: {lastRefresh.toLocaleString()}
          </p>
        )}
      </div>
      {children}
    </div>
  );

  // Role-to-component mapping
  const getDashboardComponent = () => {
    const commonProps = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dashboardData: dashboardData as any, // Type assertion needed for role-specific dashboard data
      loading: dashboardLoading,
      onRefresh: refreshDashboard,
    };

    if (rolePermissions.isJobSeeker)
      return <JobSeekerDashboard {...commonProps} />;
    if (rolePermissions.isRecruiter)
      return <RecruiterDashboard {...commonProps} />;
    if (rolePermissions.isEmployer)
      return <EmployerDashboard {...commonProps} />;
    if (rolePermissions.isAdmin) return <AdminDashboard {...commonProps} />;

    // Fallback for unknown roles
    return (
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-4">Welcome to MyVideoResume</h1>
        <p className="text-muted-foreground">
          Your role ({user?.role}) doesn&apos;t have a specific dashboard yet.
        </p>
      </div>
    );
  };

  // Render dashboard content with unified error/loading handling
  const renderDashboardContent = () => {
    if (dashboardLoading) {
      return (
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Loading dashboard...</p>
          </div>
        </div>
      );
    }

    if (dashboardError) {
      return (
        <div className="max-w-7xl mx-auto px-4 py-8">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {dashboardError}
              <Button
                variant="outline"
                size="sm"
                className="ml-4"
                onClick={refreshDashboard}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      );
    }

    if (!dashboardData) {
      return (
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="text-center">
            <p className="text-muted-foreground">No dashboard data available</p>
          </div>
        </div>
      );
    }

    return <DashboardWrapper>{getDashboardComponent()}</DashboardWrapper>;
  };

  // Shared layout component
  const PageLayout: React.FC<{ children: React.ReactNode }> = ({
    children,
  }) => (
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
        <div className="pt-16">{children}</div>
        <Footer />
      </div>
    </div>
  );

  // Show loading state while authentication is being determined
  if (isLoading) {
    return (
      <PageLayout>
        <div className="max-w-7xl mx-auto px-4 py-16">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Loading dashboard...</p>
          </div>
        </div>
      </PageLayout>
    );
  }

  // If user is not authenticated, show marketing content (SEO-friendly)
  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-brand-purple/5 to-brand-blue/5">
        <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} collapsed={sidebarCollapsed} />
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
                    <TrendingUp className="h-12 w-12 text-primary" />
                    <Sparkles className="h-6 w-6 text-brand-blue absolute -top-1 -right-1" />
                  </div>
                  <span className="text-4xl font-bold bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
                    Smart Dashboard
                  </span>
                </div>
                <h1 className="text-5xl font-bold mb-6">Your Career Command Center</h1>
                <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
                  Track your resumes, jobs, outreach, and network in one place. Personalized insights and actions to accelerate your career.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Link to="/signup">
                    <Button size="lg" className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-lg px-8">
                      Get Started Free
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </Link>
                  <Link to="/login">
                    <Button size="lg" variant="outline" className="text-lg px-8">
                      Sign In
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Benefits Section */}
              <div className="grid md:grid-cols-3 gap-8 mb-16">
                <Card className="border-brand-purple/20 hover:border-brand-purple/40 transition-colors">
                  <CardHeader>
                    <VideoIcon className="h-10 w-10 text-brand-purple mb-4" />
                    <CardTitle>Unified View</CardTitle>
                    <CardDescription>
                      See your latest resumes, job applications, and outreach stats at a glance.
                    </CardDescription>
                  </CardHeader>
                </Card>

                <Card className="border-brand-blue/20 hover:border-brand-blue/40 transition-colors">
                  <CardHeader>
                    <Briefcase className="h-10 w-10 text-brand-blue mb-4" />
                    <CardTitle>Actionable Insights</CardTitle>
                    <CardDescription>
                      AI-powered recommendations to help you take the next best step.
                    </CardDescription>
                  </CardHeader>
                </Card>

                <Card className="border-primary/20 hover:border-primary/40 transition-colors">
                  <CardHeader>
                    <Users className="h-10 w-10 text-primary mb-4" />
                    <CardTitle>Network Growth</CardTitle>
                    <CardDescription>
                      Track connections and outreach performance over time.
                    </CardDescription>
                  </CardHeader>
                </Card>
              </div>
            </div>
          </div>

          <Footer />
        </div>
      </div>
    );
  }

  // Main dashboard render
  return <PageLayout>{renderDashboardContent()}</PageLayout>;
}
