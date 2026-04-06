import React, { useState, useEffect } from "react";
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
          title: "Total Users",
          value: m.userMetrics.totalUsers.toLocaleString(),
          change: `+${m.userMetrics.newUsersLast30Days} this month`,
          trend: m.userMetrics.newUsersLast30Days > 0 ? "up" : "neutral",
          icon: <Users className="h-5 w-5" />,
        },
        {
          title: "Monthly Revenue",
          value: `$${m.saasMetrics.monthlyRecurringRevenue.toLocaleString()}`,
          change: m.saasMetrics.growthRate > 0 ? `+${m.saasMetrics.growthRate}% growth` : "No change",
          trend: m.saasMetrics.growthRate > 0 ? "up" : "neutral",
          icon: <DollarSign className="h-5 w-5" />,
        },
        {
          title: "Active Jobs",
          value: m.jobMetrics.activeJobs.toLocaleString(),
          change: `+${m.jobMetrics.newJobsLast30Days} this month`,
          trend: m.jobMetrics.newJobsLast30Days > 0 ? "up" : "neutral",
          icon: <BarChart3 className="h-5 w-5" />,
        },
        {
          title: "Subscriptions",
          value: m.saasMetrics.activeSubscriptions.toLocaleString(),
          change: `ARR $${m.saasMetrics.annualRecurringRevenue.toLocaleString()}`,
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
            <h2 className="text-xl font-semibold mb-2">Access Restricted</h2>
            <p className="text-muted-foreground">
              You don't have permission to access the admin dashboard.
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
          <h1 className="text-2xl sm:text-3xl font-bold">Admin Dashboard</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            Manage your team, billing, and organization settings
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <Badge variant={isOwner ? "default" : "secondary"} className="self-start sm:self-auto">
            {isOwner ? "Account Owner" : "Admin"}
          </Badge>
          <span className="text-sm text-muted-foreground">
            Welcome back, {user?.firstName || "Admin"}
          </span>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4 sm:space-y-6">
        <div className="w-full overflow-x-auto -mx-6 px-6 sm:mx-0 sm:px-0">
          <TabsList className={`inline-flex sm:grid w-auto sm:w-full ${isAdmin ? 'sm:grid-cols-5' : 'sm:grid-cols-2'} gap-1 min-w-max sm:min-w-0`}>
            <TabsTrigger value="overview" className="flex items-center gap-2 text-sm whitespace-nowrap px-4 sm:px-3">
              <BarChart3 className="h-4 w-4" />
              <span>Overview</span>
            </TabsTrigger>

            {isAdmin && (
              <TabsTrigger value="team" className="flex items-center gap-2 text-sm whitespace-nowrap px-4 sm:px-3">
                <Users className="h-4 w-4" />
                <span>Team</span>
              </TabsTrigger>
            )}
            {isAdmin && (
              <TabsTrigger value="billing" className="flex items-center gap-2 text-sm whitespace-nowrap px-4 sm:px-3">
                <CreditCard className="h-4 w-4" />
                <span>Billing</span>
              </TabsTrigger>
            )}
            {isAdmin && (
              <TabsTrigger value="analytics" className="flex items-center gap-2 text-sm whitespace-nowrap px-4 sm:px-3">
                <TrendingUp className="h-4 w-4" />
                <span>Analytics</span>
              </TabsTrigger>
            )}

            <TabsTrigger value="settings" className="flex items-center gap-2 text-sm whitespace-nowrap px-4 sm:px-3">
              <Settings className="h-4 w-4" />
              <span>Settings</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="space-y-4 sm:space-y-6">
          {/* Quick Stats */}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading metrics...
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
                      <h3 className="text-sm sm:text-base font-semibold">Invite Team Member</h3>
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        Add new users to your organization
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
                      <h3 className="text-sm sm:text-base font-semibold">Manage Billing</h3>
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        Update payment methods and plans
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
                    <h3 className="font-semibold">Organization Settings</h3>
                    <p className="text-sm text-muted-foreground">
                      Configure company preferences
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
                <CardTitle>Team Management</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">
                  Team management features have been moved to the dedicated
                  Account Management page.
                </p>
                <Button asChild>
                  <a href="/account">Go to Account Management</a>
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
              <CardTitle>Organization Settings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <h3 className="font-semibold">Company Profile</h3>
                    <p className="text-sm text-muted-foreground">
                      Update your organization's basic information
                    </p>
                  </div>
                  <Button variant="outline">Edit</Button>
                </div>

                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <h3 className="font-semibold">Security Settings</h3>
                    <p className="text-sm text-muted-foreground">
                      Manage authentication and security policies
                    </p>
                  </div>
                  <Button variant="outline">Configure</Button>
                </div>

                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <h3 className="font-semibold">Integrations</h3>
                    <p className="text-sm text-muted-foreground">
                      Connect with third-party services and APIs
                    </p>
                  </div>
                  <Button variant="outline">Manage</Button>
                </div>

                {isOwner && (
                  <div className="flex items-center justify-between p-4 border rounded-lg border-red-200">
                    <div>
                      <h3 className="font-semibold text-red-600">
                        Danger Zone
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Irreversible actions that affect your entire
                        organization
                      </p>
                    </div>
                    <Button variant="destructive" size="sm">
                      Delete Organization
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
