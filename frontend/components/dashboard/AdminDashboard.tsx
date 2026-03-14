import React from "react";
import {
  BarChart3,
  Users,
  DollarSign,
  Activity,
  Shield,
  HelpCircle,
} from "lucide-react";
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
import QuickActions from "./shared/QuickActions";
import type { BaseDashboard } from "@/lib/services/dashboard-service";

interface AdminDashboardProps {
  dashboardData: BaseDashboard & {
    platformStats?: {
      totalUsers: number;
      activeUsers: number;
      newUsersThisMonth: number;
      userGrowthRate: number;
      usersByRole: Record<string, number>;
    };
    revenueStats?: {
      monthlyRecurringRevenue: number;
      annualRecurringRevenue: number;
      averageRevenuePerUser: number;
      churnRate: number;
      paidAccounts: number;
      freeAccounts: number;
    };
    systemHealth?: {
      uptimePercentage: number;
      averageResponseTime: number;
      errorRate: number;
      activeSessions: number;
      status: string;
    };
    supportStats?: {
      openTickets: number;
      resolvedTickets: number;
      averageResolutionTime: number;
      customerSatisfactionScore: number;
    };
    featureUsage?: Array<{
      featureName: string;
      usageCount: number;
      usagePercentage: number;
      category: string;
    }>;
  };
  loading?: boolean;
  onRefresh?: () => void;
}

export function AdminDashboard({
  dashboardData,
  loading = false,
  onRefresh: _onRefresh,
}: AdminDashboardProps) {
  if (loading) {
    return (
      <div className="space-y-6">
        {/* Loading skeletons */}
        <div className="h-32 bg-gray-200 rounded-lg animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-24 bg-gray-200 rounded-lg animate-pulse"
            />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-64 bg-gray-200 rounded-lg animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Onboarding Progress */}
      <OnboardingProgress
        tasks={dashboardData.onboardingTasks || []}
        loading={loading}
      />

      {/* Metrics Grid */}
      <MetricGrid
        metrics={dashboardData.metrics || []}
        loading={loading}
        emptyMessage="Platform metrics will appear here once data is available."
      />

      {/* Platform & Revenue Stats Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Platform Statistics */}
        {dashboardData.platformStats && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Platform Statistics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="text-center p-3 bg-muted/30 rounded-lg">
                  <div className="text-2xl font-bold text-primary">
                    {dashboardData.platformStats.totalUsers.toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Total Users
                  </div>
                </div>
                <div className="text-center p-3 bg-muted/30 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">
                    {dashboardData.platformStats.activeUsers.toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Active Users
                  </div>
                </div>
                <div className="text-center p-3 bg-muted/30 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">
                    {dashboardData.platformStats.newUsersThisMonth.toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    New This Month
                  </div>
                </div>
                <div className="text-center p-3 bg-muted/30 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">
                    {dashboardData.platformStats.userGrowthRate.toFixed(1)}%
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Growth Rate
                  </div>
                </div>
              </div>

              {/* User Roles Breakdown */}
              {dashboardData.platformStats.usersByRole &&
                Object.keys(dashboardData.platformStats.usersByRole).length >
                  0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-muted-foreground">
                      Users by Role
                    </h4>
                    {Object.entries(
                      dashboardData.platformStats.usersByRole,
                    ).map(([role, count]) => (
                      <div
                        key={role}
                        className="flex items-center justify-between p-2 bg-muted/20 rounded"
                      >
                        <span className="text-sm capitalize">{role}</span>
                        <Badge variant="secondary" className="text-xs">
                          {count.toLocaleString()}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
            </CardContent>
          </Card>
        )}

        {/* Revenue Statistics */}
        {dashboardData.revenueStats && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Revenue Overview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">
                    Monthly Recurring Revenue
                  </span>
                  <span className="font-semibold text-green-600">
                    $
                    {dashboardData.revenueStats.monthlyRecurringRevenue.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">
                    Annual Recurring Revenue
                  </span>
                  <span className="font-semibold">
                    $
                    {dashboardData.revenueStats.annualRecurringRevenue.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">
                    Average Revenue Per User
                  </span>
                  <span className="font-semibold">
                    $
                    {dashboardData.revenueStats.averageRevenuePerUser.toFixed(
                      2,
                    )}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">
                    Churn Rate
                  </span>
                  <span
                    className={`font-semibold ${dashboardData.revenueStats.churnRate > 5 ? "text-red-600" : "text-green-600"}`}
                  >
                    {dashboardData.revenueStats.churnRate.toFixed(1)}%
                  </span>
                </div>
                <div className="pt-2 border-t">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">
                      Paid Accounts
                    </span>
                    <span className="font-semibold text-green-600">
                      {dashboardData.revenueStats.paidAccounts.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-sm text-muted-foreground">
                      Free Accounts
                    </span>
                    <span className="font-semibold">
                      {dashboardData.revenueStats.freeAccounts.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* System Health & Support Stats Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* System Health */}
        {dashboardData.systemHealth && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                System Health
                <Badge
                  variant={
                    dashboardData.systemHealth.status === "healthy"
                      ? "default"
                      : "destructive"
                  }
                  className="ml-2"
                >
                  {dashboardData.systemHealth.status}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-muted/30 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">
                    {dashboardData.systemHealth.uptimePercentage.toFixed(2)}%
                  </div>
                  <div className="text-xs text-muted-foreground">Uptime</div>
                </div>
                <div className="text-center p-3 bg-muted/30 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">
                    {dashboardData.systemHealth.averageResponseTime.toFixed(0)}
                    ms
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Avg Response
                  </div>
                </div>
                <div className="text-center p-3 bg-muted/30 rounded-lg">
                  <div
                    className={`text-2xl font-bold ${dashboardData.systemHealth.errorRate > 1 ? "text-red-600" : "text-green-600"}`}
                  >
                    {dashboardData.systemHealth.errorRate.toFixed(2)}%
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Error Rate
                  </div>
                </div>
                <div className="text-center p-3 bg-muted/30 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">
                    {dashboardData.systemHealth.activeSessions.toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Active Sessions
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Support Statistics */}
        {dashboardData.supportStats && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HelpCircle className="h-5 w-5" />
                Support Statistics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">
                    Open Tickets
                  </span>
                  <span
                    className={`font-semibold ${dashboardData.supportStats.openTickets > 10 ? "text-red-600" : "text-green-600"}`}
                  >
                    {dashboardData.supportStats.openTickets}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">
                    Resolved Tickets
                  </span>
                  <span className="font-semibold text-green-600">
                    {dashboardData.supportStats.resolvedTickets}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">
                    Avg Resolution Time
                  </span>
                  <span className="font-semibold">
                    {dashboardData.supportStats.averageResolutionTime.toFixed(
                      1,
                    )}{" "}
                    hours
                  </span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t">
                  <span className="text-sm text-muted-foreground">
                    Customer Satisfaction
                  </span>
                  <span
                    className={`font-semibold ${dashboardData.supportStats.customerSatisfactionScore >= 4 ? "text-green-600" : "text-yellow-600"}`}
                  >
                    {dashboardData.supportStats.customerSatisfactionScore.toFixed(
                      1,
                    )}
                    /5.0
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Feature Usage */}
      {dashboardData.featureUsage && dashboardData.featureUsage.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Feature Usage Analytics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {dashboardData.featureUsage.slice(0, 8).map((feature, index) => (
                <div
                  key={feature.featureName || index}
                  className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
                >
                  <div>
                    <div className="font-medium text-sm">
                      {feature.featureName}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {feature.category}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-primary">
                      {feature.usageCount.toLocaleString()}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {feature.usagePercentage.toFixed(1)}%
                    </div>
                  </div>
                </div>
              ))}
              {dashboardData.featureUsage.length > 8 && (
                <Button variant="outline" className="w-full">
                  View All Features ({dashboardData.featureUsage.length} total)
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Platform Summary */}
      {dashboardData.platformStats && dashboardData.revenueStats && (
        <Card className="bg-gradient-to-r from-purple-50 to-blue-50 border-purple-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-purple-600" />
              Platform Overview
            </CardTitle>
            <CardDescription>
              Key performance indicators for the entire platform
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">
                  {dashboardData.platformStats.totalUsers.toLocaleString()}
                </div>
                <div className="text-xs text-muted-foreground">Total Users</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  $
                  {(
                    dashboardData.revenueStats.monthlyRecurringRevenue / 1000
                  ).toFixed(0)}
                  k
                </div>
                <div className="text-xs text-muted-foreground">
                  Monthly Revenue
                </div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {dashboardData.platformStats.userGrowthRate.toFixed(1)}%
                </div>
                <div className="text-xs text-muted-foreground">Growth Rate</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">
                  {dashboardData.systemHealth?.uptimePercentage
                    ? dashboardData.systemHealth.uptimePercentage.toFixed(1)
                    : "N/A"}
                  {dashboardData.systemHealth?.uptimePercentage ? "%" : ""}
                </div>
                <div className="text-xs text-muted-foreground">Uptime</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <ActivityFeed
          activities={dashboardData.recentActivity || []}
          loading={loading}
          onViewAll={() => {
            /* TODO: Implement view all activity */
          }}
          title="System Activity"
        />

        {/* Quick Actions */}
        <QuickActions userRole="admin" loading={loading} />
      </div>
    </div>
  );
}

export default AdminDashboard;
