import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  CreditCard,
  BarChart3,
  Settings,
  Shield,
  TrendingUp,
  UserPlus,
  DollarSign,
  Calendar,
  Loader2,
} from "lucide-react";

import { BillingManagement } from "@/components/billing/BillingManagement";
import { BillingAnalytics } from "@/components/billing/BillingAnalytics";
import { usePermissions } from "@/hooks/use-permissions";
import { useAuth } from "@/lib/auth";
import { apiClient } from "@/lib/api-client";

interface DashboardMetrics {
  userMetrics: {
    totalUsers: number;
    activeUsers: number;
    newUsersLast30Days: number;
    usersByRole: Record<string, number>;
    usersByStatus: { active: number; inactive: number };
  };
  jobMetrics: {
    totalJobs: number;
    activeJobs: number;
    newJobsLast30Days: number;
  };
  saasMetrics: {
    monthlyRecurringRevenue: number;
    annualRecurringRevenue: number;
    growthRate: number;
    activeSubscriptions: number;
  };
}

interface QuickStat {
  title: string;
  value: string;
  change: string;
  trend: "up" | "down" | "neutral";
  icon: React.ReactNode;
}

export default function AdminDashboard() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("overview");
  const { user } = useAuth();
  const { isAdmin } = usePermissions();
  const isOwner = isAdmin;
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      try {
        setLoading(true);
        const res = await apiClient.get<DashboardMetrics>(
          "/api/admin?IncludeSaaSMetrics=true"
        );
        setMetrics(res.data);
      } catch {
        // Silently fail — cards will show fallback
      } finally {
        setLoading(false);
      }
    })();
  }, [isAdmin]);

  const m = metrics;
  const quickStats: QuickStat[] = m
    ? [
        {
          title: t("metrics.totalUsers"),
          value: m.userMetrics.totalUsers.toLocaleString(),
          change: t("messages.changeThisMonth", { count: m.userMetrics.newUsersLast30Days }),
          trend: m.userMetrics.newUsersLast30Days > 0 ? "up" : "neutral",
          icon: <Users className="h-5 w-5" />,
        },
        {
          title: t("metrics.monthlyRevenue"),
          value: `$${m.saasMetrics.monthlyRecurringRevenue.toLocaleString()}`,
          change: m.saasMetrics.growthRate > 0
            ? t("messages.growthDelta", { percent: m.saasMetrics.growthRate })
            : t("messages.noChangeMsg"),
          trend: m.saasMetrics.growthRate > 0 ? "up" : "neutral",
          icon: <DollarSign className="h-5 w-5" />,
        },
        {
          title: t("metrics.activeJobs"),
          value: m.jobMetrics.activeJobs.toLocaleString(),
          change: t("messages.changeThisMonth", { count: m.jobMetrics.newJobsLast30Days }),
          trend: m.jobMetrics.newJobsLast30Days > 0 ? "up" : "neutral",
          icon: <BarChart3 className="h-5 w-5" />,
        },
        {
          title: t("labels.subscriptions"),
          value: m.saasMetrics.activeSubscriptions.toLocaleString(),
          change: t("messages.arrSuffix", { value: m.saasMetrics.annualRecurringRevenue.toLocaleString() }),
          trend: "neutral",
          icon: <CreditCard className="h-5 w-5" />,
        },
      ]
    : [];

  const getTrendColor = (trend: string) => {
    switch (trend) {
      case "up": return "text-green-600";
      case "down": return "text-red-600";
      default: return "text-muted-foreground";
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case "up": return <TrendingUp className="h-4 w-4" />;
      case "down": return <TrendingUp className="h-4 w-4 rotate-180" />;
      default: return <Calendar className="h-4 w-4" />;
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <Shield className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">{t("headings.accessRestricted")}</h2>
            <p className="text-muted-foreground">
              {t("errors.youDontHaveAdminAccess")}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold">{t("headings.adminDashboard")}</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            {t("messages.adminDashboardIntro")}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <Badge variant={isOwner ? "default" : "secondary"} className="self-start sm:self-auto">
            {isOwner ? t("labels.accountOwner") : t("labels.admin")}
          </Badge>
          <span className="text-sm text-muted-foreground">
            {t("labels.welcomeBackUser", { name: user?.firstName || t("labels.admin") })}
          </span>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4 sm:space-y-6">
        <div className="w-full overflow-x-auto -mx-6 px-6 sm:mx-0 sm:px-0">
          <TabsList className={`inline-flex sm:grid w-auto sm:w-full ${isAdmin ? 'sm:grid-cols-5' : 'sm:grid-cols-2'} gap-1 min-w-max sm:min-w-0`}>
            <TabsTrigger value="overview" className="flex items-center gap-2 text-sm whitespace-nowrap px-4 sm:px-3">
              <BarChart3 className="h-4 w-4" />
              <span>{t("tabs.overview")}</span>
            </TabsTrigger>

            {isAdmin && (
              <TabsTrigger value="team" className="flex items-center gap-2 text-sm whitespace-nowrap px-4 sm:px-3">
                <Users className="h-4 w-4" />
                <span>{t("tabs.team")}</span>
              </TabsTrigger>
            )}
            {isAdmin && (
              <TabsTrigger value="billing" className="flex items-center gap-2 text-sm whitespace-nowrap px-4 sm:px-3">
                <CreditCard className="h-4 w-4" />
                <span>{t("tabs.billingShort")}</span>
              </TabsTrigger>
            )}
            {isAdmin && (
              <TabsTrigger value="analytics" className="flex items-center gap-2 text-sm whitespace-nowrap px-4 sm:px-3">
                <TrendingUp className="h-4 w-4" />
                <span>{t("tabs.analytics")}</span>
              </TabsTrigger>
            )}

            <TabsTrigger value="settings" className="flex items-center gap-2 text-sm whitespace-nowrap px-4 sm:px-3">
              <Settings className="h-4 w-4" />
              <span>{t("headings.settings")}</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="space-y-4 sm:space-y-6">
          {/* Quick Stats */}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              {t("status.loadingMetrics")}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              {quickStats.map((stat, index) => (
                <Card key={index}>
                  <CardContent className="pt-4 sm:pt-6">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs sm:text-sm font-medium text-muted-foreground">
                          {stat.title}
                        </p>
                        <p className="text-xl sm:text-2xl font-bold truncate">{stat.value}</p>
                      </div>
                      <div className="p-2 bg-primary/10 rounded-lg flex-shrink-0">
                        {stat.icon}
                      </div>
                    </div>
                    <div className={`flex items-center mt-2 ${getTrendColor(stat.trend)}`}>
                      {getTrendIcon(stat.trend)}
                      <span className="text-xs sm:text-sm ml-1 truncate">{stat.change}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Quick Actions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {isAdmin && (
              <Card className="cursor-pointer hover:shadow-md transition-shadow min-h-[44px]">
                <CardContent className="pt-4 sm:pt-6">
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className="p-2 sm:p-3 bg-blue-100 rounded-lg flex-shrink-0">
                      <UserPlus className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm sm:text-base font-semibold">{t("messages.inviteTeamMember")}</h3>
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        {t("messages.inviteTeamMemberDesc")}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {isAdmin && (
              <Card className="cursor-pointer hover:shadow-md transition-shadow min-h-[44px]">
                <CardContent className="pt-4 sm:pt-6">
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className="p-2 sm:p-3 bg-green-100 rounded-lg flex-shrink-0">
                      <CreditCard className="h-5 w-5 sm:h-6 sm:w-6 text-green-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm sm:text-base font-semibold">{t("messages.manageBilling")}</h3>
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        {t("messages.manageBillingDesc")}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="cursor-pointer hover:shadow-md transition-shadow">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-purple-100 rounded-lg">
                    <Settings className="h-6 w-6 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{t("headings.organizationSettings")}</h3>
                    <p className="text-sm text-muted-foreground">
                      {t("messages.organizationSettingsDesc")}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {isAdmin && (
          <TabsContent value="team">
            <Card>
              <CardHeader>
                <CardTitle>{t("headings.teamManagement")}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">
                  {t("messages.teamMovedToSettings")}
                </p>
                <Button asChild>
                  <a href="/settings">{t("actions.goToAccountSettings")}</a>
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="billing">
            <BillingManagement />
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="analytics">
            <BillingAnalytics />
          </TabsContent>
        )}

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("headings.organizationSettings")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <h3 className="font-semibold">{t("headings.companyProfile")}</h3>
                    <p className="text-sm text-muted-foreground">
                      {t("messages.companyProfileDesc")}
                    </p>
                  </div>
                  <Button variant="outline">{t("actions.edit")}</Button>
                </div>

                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <h3 className="font-semibold">{t("headings.securitySettings")}</h3>
                    <p className="text-sm text-muted-foreground">
                      {t("messages.securitySettingsDesc")}
                    </p>
                  </div>
                  <Button variant="outline">{t("actions.configure")}</Button>
                </div>

                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <h3 className="font-semibold">{t("tabs.integrations")}</h3>
                    <p className="text-sm text-muted-foreground">
                      {t("messages.integrationsDesc")}
                    </p>
                  </div>
                  <Button variant="outline">{t("actions.manage")}</Button>
                </div>

                {isOwner && (
                  <div className="flex items-center justify-between p-4 border rounded-lg border-red-200">
                    <div>
                      <h3 className="font-semibold text-red-600">
                        {t("headings.dangerZone")}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {t("messages.dangerZoneDesc")}
                      </p>
                    </div>
                    <Button variant="destructive" size="sm">
                      {t("actions.deleteOrganization")}
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
