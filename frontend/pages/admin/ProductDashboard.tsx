import { useTranslation } from "react-i18next";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { createRolePermissions } from "@/lib/role-utils";
import { AffiliateManagementPanel } from "@/components/admin/AffiliateManagementPanel";
import { PayoutProcessingPanel } from "@/components/admin/PayoutProcessingPanel";
import { GaugeCard } from "@/components/dashboard/gauge/GaugeCard";
import { buildPlatformGauge } from "@/lib/dashboard/gauge";
import { useProductDashboard } from "@/components/admin/product-dashboard/use-product-dashboard";
import {
  DashboardAccessRestricted,
  DashboardLoading,
  DashboardError,
} from "@/components/admin/product-dashboard/DashboardStates";
import { DashboardTabList } from "@/components/admin/product-dashboard/DashboardTabList";
import { OverviewTab } from "@/components/admin/product-dashboard/OverviewTab";
import { UsersTab } from "@/components/admin/product-dashboard/UsersTab";
import { JobsTab, CompaniesTab, ResumesTab } from "@/components/admin/product-dashboard/EntityTabs";
import { SaasTab } from "@/components/admin/product-dashboard/SaasTab";
import { AffiliatesTab } from "@/components/admin/product-dashboard/AffiliatesTab";

export default function ProductDashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();

  // Check if user has admin permissions
  const rolePermissions = createRolePermissions(user?.role);
  const isAdmin = rolePermissions.isSuperAdmin; // Only SuperAdmin users can access product dashboard

  const {
    activeTab,
    setActiveTab,
    dashboardData,
    affiliateStats,
    loading,
    error,
    affiliateManagementOpen,
    setAffiliateManagementOpen,
    payoutProcessingOpen,
    setPayoutProcessingOpen,
    loadDashboardData,
    exportData,
  } = useProductDashboard(isAdmin);

  if (!isAdmin) {
    return <DashboardAccessRestricted />;
  }

  if (loading) {
    return <DashboardLoading />;
  }

  if (error) {
    return <DashboardError error={error} onRetry={loadDashboardData} />;
  }

  if (!dashboardData) {
    return null;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold">{t("headings.productDashboard")}</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            {t("messages.productDashboardIntro")}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <Badge variant="default" className="bg-primary self-start sm:self-auto">
            {t("labels.superAdmin")}
          </Badge>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => exportData("csv")} className="flex-1 sm:flex-none min-h-[44px]">
              <Download className="h-4 w-4 mr-2" />
              <span className="sm:inline">{t("actions.exportCsv")}</span>
            </Button>
            <Button variant="outline" onClick={loadDashboardData} className="flex-1 sm:flex-none min-h-[44px]">
              <RefreshCw className="h-4 w-4 mr-2" />
              <span className="sm:inline">{t("actions.refresh")}</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Platform-health speedometer — at-a-glance owner score, mirrors
          the "Your Score / Org Avg" overview from the reference design. */}
      <GaugeCard
        className="lg:max-w-md"
        model={buildPlatformGauge(
          {
            totalUsers: dashboardData.userMetrics.totalUsers,
            activeUsers: dashboardData.userMetrics.activeUsers,
            churnRate: dashboardData.saasMetrics?.churnRate,
            conversionRate: dashboardData.saasMetrics?.conversionRate,
          },
          t,
        )}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4 sm:space-y-6">
        <DashboardTabList />

        <TabsContent value="overview">
          <OverviewTab data={dashboardData} />
        </TabsContent>

        <TabsContent value="users">
          <UsersTab data={dashboardData} />
        </TabsContent>

        <TabsContent value="jobs">
          <JobsTab data={dashboardData} />
        </TabsContent>

        <TabsContent value="companies">
          <CompaniesTab data={dashboardData} />
        </TabsContent>

        <TabsContent value="resumes">
          <ResumesTab data={dashboardData} />
        </TabsContent>

        <TabsContent value="saas">
          <SaasTab saas={dashboardData.saasMetrics} />
        </TabsContent>

        <TabsContent value="affiliates" className="space-y-6">
          <AffiliatesTab
            stats={affiliateStats}
            onManageAffiliates={() => setAffiliateManagementOpen(true)}
            onProcessPayouts={() => setPayoutProcessingOpen(true)}
          />
        </TabsContent>
      </Tabs>

      {/* Slide-out Panels */}
      <AffiliateManagementPanel
        open={affiliateManagementOpen}
        onOpenChange={setAffiliateManagementOpen}
      />
      <PayoutProcessingPanel
        open={payoutProcessingOpen}
        onOpenChange={setPayoutProcessingOpen}
      />
    </div>
  );
}
