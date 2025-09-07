import React from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

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
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();
  const { user, isAuthenticated, isLoading } = useAuth();

  // Use custom dashboard hook for data management
  const { 
    dashboardData, 
    loading: dashboardLoading, 
    error: dashboardError, 
    lastRefresh, 
    refreshDashboard 
  } = useDashboard();

  // Get role permissions for routing
  const rolePermissions = createRolePermissions(user?.role);

  // Dashboard wrapper component
  const DashboardWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">{dashboardData?.title}</h1>
        <p className="text-muted-foreground">{dashboardData?.description}</p>
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

    if (rolePermissions.isJobSeeker) return <JobSeekerDashboard {...commonProps} />;
    if (rolePermissions.isRecruiter) return <RecruiterDashboard {...commonProps} />;
    if (rolePermissions.isEmployer) return <EmployerDashboard {...commonProps} />;
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

    return (
      <DashboardWrapper>
        {getDashboardComponent()}
      </DashboardWrapper>
    );
  };

  // Shared layout component
  const PageLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => (
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
          {children}
        </div>
      </div>
      <Footer />
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

  // If user is not authenticated, redirect to login
  if (!isAuthenticated || !user) {
    return (
      <PageLayout>
        <div className="max-w-7xl mx-auto px-4 py-16">
          <div className="text-center">
            <h1 className="text-3xl font-bold mb-4">Access Denied</h1>
            <p className="text-muted-foreground mb-8">
              Please log in to access your dashboard.
            </p>
            <Button onClick={() => window.location.href = '/login'}>
              Go to Login
            </Button>
          </div>
        </div>
      </PageLayout>
    );
  }

  // Main dashboard render
  return (
    <PageLayout>
      {renderDashboardContent()}
    </PageLayout>
  );
}
