import React, { useState } from "react";
import {
  AlertCircle,
  RefreshCw,
  TrendingUp,
  Video as VideoIcon,
  Users,
  Briefcase,
  Sparkles,
  ArrowRight,
  PenLine,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { useAuth } from "@/lib/auth";
import { createRolePermissions } from "@/lib/role-utils";
import { useEffectiveRole } from "@/hooks/use-effective-role";
import useDashboard from "@/hooks/dashboard/useDashboard";
import ReferralBanner from "@/components/ReferralBanner";
import AdSlot from "@/components/ads/AdSlot";

// Role-specific dashboard components
import JobSeekerDashboard from "@/components/dashboard/JobSeekerDashboard";
import RecruiterDashboard from "@/components/dashboard/RecruiterDashboard";
import EmployerDashboard from "@/components/dashboard/EmployerDashboard";
import AdminDashboard from "@/components/dashboard/AdminDashboard";
import CreatorDashboard from "@/components/dashboard/CreatorDashboard";
import TabStrip, { type TabStripItem } from "@/components/ui/tab-strip";
import { BarChart3, Activity } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import ProductDashboard from "@/pages/admin/ProductDashboard";


type DashboardTab = "activity" | "content";

const DASHBOARD_TABS: TabStripItem<DashboardTab>[] = [
  { key: "activity", label: "Activity", icon: Activity },
  { key: "content", label: "Content", icon: BarChart3 },
];

export default function Dashboard() {
  const { t } = useTranslation();  const { user, isAuthenticated, isLoading } = useAuth();
  const effectiveRole = useEffectiveRole();
  const [activeTab, setActiveTab] = useState<DashboardTab>("activity");

  // Use custom dashboard hook for data management
  const {
    dashboardData,
    loading: dashboardLoading,
    error: dashboardError,
    lastRefresh,
    refreshDashboard,
  } = useDashboard();

  const rolePermissions = createRolePermissions(effectiveRole);

  // Dashboard wrapper component
  const DashboardWrapper: React.FC<{ children: React.ReactNode }> = ({
    children,
  }) => (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      <div className="mb-6 sm:mb-8">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex-1">
            <h1 className="text-2xl sm:text-3xl font-bold">{dashboardData?.title}</h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1">{dashboardData?.description}</p>
            {lastRefresh && (
              <p className="text-xs text-muted-foreground mt-2">
                {t("messages.lastUpdated", { date: lastRefresh.toLocaleString() })}
              </p>
            )}
          </div>
          {isAuthenticated && (
            <Button asChild variant="outline" size="sm" className="shrink-0">
              <Link to="/services/creator/articles" aria-label={t("labels.writeArticleAria")}>
                <PenLine className="h-4 w-4 mr-1" /> {t("actions.writeArticle")}
              </Link>
            </Button>
          )}
        </div>
      </div>
      <ReferralBanner />
      <AdSlot slot="dashboard-banner" size="banner" className="mb-4" />
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

    // SuperAdmin (real or previewed) gets the Product Dashboard
    if (rolePermissions.isSuperAdmin) return <ProductDashboard />;

    // Other role-based dashboards
    if (rolePermissions.isAdmin) return <AdminDashboard {...commonProps} />;
    if (rolePermissions.isJobSeeker)
      return <JobSeekerDashboard {...commonProps} />;
    if (rolePermissions.isRecruiter)
      return <RecruiterDashboard {...commonProps} />;
    if (rolePermissions.isEmployer)
      return <EmployerDashboard {...commonProps} />;
    // Fallback for unknown roles
    return (
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-4">{t("headings.welcomeToHiredVideo")}</h1>
        <p className="text-muted-foreground">
          {t("messages.roleNoDashboard", { role: user?.role })}
        </p>
      </div>
    );
  };

  // Render dashboard content with unified error/loading handling
  const renderDashboardContent = () => {
    if (dashboardLoading) {
      return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
            <p className="text-sm sm:text-base text-muted-foreground">{t("status.loadingDashboard")}</p>
          </div>
        </div>
      );
    }

    if (dashboardError) {
      return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <span className="flex-1">{dashboardError}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={refreshDashboard}
                className="min-h-[44px] w-full sm:w-auto"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                {t("actions.retry")}
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      );
    }

    if (!dashboardData) {
      return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <div className="text-center">
            <p className="text-sm sm:text-base text-muted-foreground">{t("messages.noDashboardData")}</p>
          </div>
        </div>
      );
    }

    return (
      <DashboardWrapper>
        {/* Tab strip — Activity (role-aware role dashboard) vs Content
            (cross-artifact creator rollup per Gap Register #1019 L5).
            Hidden for SuperAdmin since the Product Dashboard is its own
            self-contained surface. */}
        {!rolePermissions.isSuperAdmin && (
          <div className="px-1">
            <TabStrip<DashboardTab>
              tabs={DASHBOARD_TABS}
              activeKey={activeTab}
              onChange={setActiveTab}
            />
          </div>
        )}
        {activeTab === "content" && !rolePermissions.isSuperAdmin ? (
          <CreatorDashboard />
        ) : (
          getDashboardComponent()
        )}
      </DashboardWrapper>
    );
  };

  // Shared layout component
  const PageLayout: React.FC<{ children: React.ReactNode }> = ({
    children,
  }) => (
    <AppShell bgClassName="bg-gradient-to-br from-background via-brand-purple/5 to-brand-blue/5">
<div>{children}</div>
</AppShell>
  );

  // Show loading state while authentication is being determined
  if (isLoading) {
    return (
      <PageLayout>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
            <p className="text-sm sm:text-base text-muted-foreground">{t("status.loadingDashboard")}</p>
          </div>
        </div>
      </PageLayout>
    );
  }

  // If user is not authenticated, show marketing content (SEO-friendly)
  if (!isAuthenticated || !user) {
    return (
      <AppShell bgClassName="bg-gradient-to-br from-background via-brand-purple/5 to-brand-blue/5">
<div>
            <div className="max-w-6xl mx-auto px-4 py-16">
              {/* Hero Section */}
              <div className="text-center mb-16">
                <div className="inline-flex items-center space-x-2 mb-6">
                  <div className="relative">
                    <TrendingUp className="h-12 w-12 text-primary" />
                    <Sparkles className="h-6 w-6 text-brand-blue absolute -top-1 -right-1" />
                  </div>
                  <span className="text-4xl font-bold bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
                    {t("labels.smartDashboard")}
                  </span>
                </div>
                <h1 className="text-5xl font-bold mb-6">{t("headings.careerCommandCenter")}</h1>
                <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
                  {t("messages.careerCommandCenterIntro")}
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Link to="/signup">
                    <Button size="lg" className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-lg px-8">
                      {t("actions.getStartedFree")}
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </Link>
                  <Link to="/login">
                    <Button size="lg" variant="outline" className="text-lg px-8">
                      {t("actions.signIn")}
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Benefits Section */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
                <Card className="border-brand-purple/20 hover:border-brand-purple/40 transition-colors">
                  <CardHeader>
                    <VideoIcon className="h-10 w-10 text-brand-purple mb-4" />
                    <CardTitle>{t("headings.unifiedView")}</CardTitle>
                    <CardDescription>
                      {t("messages.unifiedViewDesc")}
                    </CardDescription>
                  </CardHeader>
                </Card>

                <Card className="border-brand-blue/20 hover:border-brand-blue/40 transition-colors">
                  <CardHeader>
                    <Briefcase className="h-10 w-10 text-brand-blue mb-4" />
                    <CardTitle>{t("headings.actionableInsights")}</CardTitle>
                    <CardDescription>
                      {t("messages.actionableInsightsDesc")}
                    </CardDescription>
                  </CardHeader>
                </Card>

                <Card className="border-primary/20 hover:border-primary/40 transition-colors">
                  <CardHeader>
                    <Users className="h-10 w-10 text-primary mb-4" />
                    <CardTitle>{t("headings.networkGrowth")}</CardTitle>
                    <CardDescription>
                      {t("messages.networkGrowthDesc")}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </div>
            </div>
          </div>
</AppShell>
  );
  }

  // Main dashboard render
  return <PageLayout>{renderDashboardContent()}</PageLayout>;
}
