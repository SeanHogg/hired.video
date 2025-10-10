import React, { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Users,
  Briefcase,
  Building2,
  FileText,
  UserCheck,
  TrendingUp,
  TrendingDown,
  Download,
  RefreshCw,
  Activity,
  DollarSign,
  BarChart3,
  PieChart,
  UserPlus,
  CreditCard,
  Banknote,
  Share2,
  Clock,
  RotateCcw,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { createRolePermissions, getRoleDisplayLabel } from "@/lib/role-utils";
import { apiClient } from "@/lib/api-client";
import { AffiliateService, type AffiliateAdminStats } from "@/lib/services/affiliate-service";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
} from "recharts";

interface ProductDashboardData {
  userMetrics: {
    totalUsers: number;
    activeUsers: number;
    newUsersLast30Days: number;
    usersByRole: Record<string, number>;
    usersByStatus: Record<string, number>;
  };
  jobMetrics: {
    totalJobs: number;
    activeJobs: number;
    newJobsLast30Days: number;
    jobsByStatus: Record<string, number>;
    jobsByOrigin: Record<string, number>;
  };
  profileMetrics: {
    totalProfiles: number;
    publicProfiles: number;
    newProfilesLast30Days: number;
    profilesByStatus: Record<string, number>;
    profilesByPrivacy: Record<string, number>;
  };
  companyMetrics: {
    totalCompanies: number;
    activeCompanies: number;
    newCompaniesLast30Days: number;
    companiesByStatus: Record<string, number>;
    companiesBySize: Record<string, number>;
  };
  resumeMetrics: {
    totalResumes: number;
    publicResumes: number;
    newResumesLast30Days: number;
    resumesByType: Record<string, number>;
    resumesByStatus: Record<string, number>;
  };
  saasMetrics?: {
    monthlyRecurringRevenue: number;
    annualRecurringRevenue: number;
    averageRevenuePerUser: number;
    customerLifetimeValue: number;
    customerAcquisitionCost: number;
    churnRate: number;
    growthRate: number;
    conversionRate: number;
    totalSubscriptions: number;
    activeSubscriptions: number;
    subscriptionsByTier: Record<string, number>;
    revenueByTier: Record<string, number>;
  };
  userGrowthLast90Days: Array<{ date: string; count: number }>;
  jobGrowthLast90Days: Array<{ date: string; count: number }>;
  profileGrowthLast90Days: Array<{ date: string; count: number }>;
  companyGrowthLast90Days: Array<{ date: string; count: number }>;
  resumeGrowthLast90Days: Array<{ date: string; count: number }>;
}

interface MetricCardProps {
  title: string;
  value: string | number;
  change?: string;
  trend?: "up" | "down" | "neutral";
  icon: React.ReactNode;
  description?: string;
}

const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  change,
  trend,
  icon,
  description,
}) => {
  const getTrendIcon = () => {
    if (trend === "up")
      return <TrendingUp className="h-4 w-4 text-green-500" />;
    if (trend === "down")
      return <TrendingDown className="h-4 w-4 text-red-500" />;
    return null;
  };

  const getTrendColor = () => {
    if (trend === "up") return "text-green-600";
    if (trend === "down") return "text-red-600";
    return "text-muted-foreground";
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">
          {typeof value === "number" ? value.toLocaleString() : value}
        </div>
        {change && (
          <div className={`flex items-center text-xs ${getTrendColor()}`}>
            {getTrendIcon()}
            <span className="ml-1">{change}</span>
          </div>
        )}
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  );
};

export default function ProductDashboard() {
  const [activeTab, setActiveTab] = useState("overview");
  const [dashboardData, setDashboardData] =
    useState<ProductDashboardData | null>(null);
  const [affiliateStats, setAffiliateStats] = useState<AffiliateAdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [affiliateLoading, setAffiliateLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  const affiliateService = new AffiliateService();

  // Check if user has admin permissions
  const rolePermissions = createRolePermissions(user?.role);
  const isAdmin = rolePermissions.isSuperAdmin; // Only SuperAdmin users can access product dashboard

  useEffect(() => {
    if (isAdmin) {
      loadDashboardData();
    }
  }, [isAdmin]);

  // Load affiliate stats when affiliates tab is active
  useEffect(() => {
    if (isAdmin && activeTab === "affiliates" && !affiliateStats) {
      loadAffiliateStats();
    }
  }, [isAdmin, activeTab, affiliateStats]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      console.log("ProductDashboard: Starting to load dashboard data...");
      // Include query parameters to ensure we get all data including SaaS metrics and time series
      const response = await apiClient.get<ProductDashboardData>(
        "/api/ProductDashboard?IncludeSaaSMetrics=true&IncludeTimeSeriesData=true"
      );
      console.log("ProductDashboard: API response received", response);

      // ApiClient returns ApiSuccessResponse<T> with structure: { success, data, timestamp }
      if (response.success && response.data) {
        console.log("ProductDashboard: Setting dashboard data", response.data);
        setDashboardData(response.data);
      } else {
        const errorMsg = "Failed to load dashboard data";
        console.error("ProductDashboard: API response not successful", response);
        setError(errorMsg);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "An error occurred";
      console.error("ProductDashboard: Error loading dashboard data", {
        error: err,
        message: errorMsg,
        stack: err instanceof Error ? err.stack : undefined
      });
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const loadAffiliateStats = async () => {
    try {
      setAffiliateLoading(true);
      console.log("ProductDashboard: Loading affiliate stats...");
      const stats = await affiliateService.getAdminStats();
      console.log("ProductDashboard: Affiliate stats loaded", stats);
      setAffiliateStats(stats);
    } catch (err) {
      console.error("ProductDashboard: Error loading affiliate stats", err);
      // Don't set main error state for affiliate stats failure
    } finally {
      setAffiliateLoading(false);
    }
  };

  const exportData = async (format: "csv") => {
    try {
      const response = await fetch(`/api/ProductDashboard/export/${format}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to export data");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      a.download = `product-dashboard-${new Date().toISOString().split("T")[0]}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed:", err);
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <Activity className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">Access Restricted</h2>
            <p className="text-muted-foreground">
              You need SuperAdmin privileges to access the Product Dashboard.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex items-center space-x-2">
          <RefreshCw className="h-6 w-6 animate-spin" />
          <span>Loading dashboard data...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <h2 className="text-xl font-semibold mb-2 text-red-600">Error</h2>
            <p className="text-muted-foreground mb-4">{error}</p>
            <Button onClick={loadDashboardData}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!dashboardData) {
    return null;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold">Product Dashboard</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            System-wide analytics and metrics for platform administration
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <Badge variant="default" className="bg-purple-600 self-start sm:self-auto">
            Super Admin
          </Badge>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => exportData("csv")} className="flex-1 sm:flex-none min-h-[44px]">
              <Download className="h-4 w-4 mr-2" />
              <span className="sm:inline">Export CSV</span>
            </Button>
            <Button variant="outline" onClick={loadDashboardData} className="flex-1 sm:flex-none min-h-[44px]">
              <RefreshCw className="h-4 w-4 mr-2" />
              <span className="sm:inline">Refresh</span>
            </Button>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3 sm:grid-cols-7 gap-1">
          <TabsTrigger value="overview" className="text-xs sm:text-sm">Overview</TabsTrigger>
          <TabsTrigger value="users" className="text-xs sm:text-sm">Users</TabsTrigger>
          <TabsTrigger value="jobs" className="text-xs sm:text-sm">Jobs</TabsTrigger>
          <TabsTrigger value="companies" className="text-xs sm:text-sm">Companies</TabsTrigger>
          <TabsTrigger value="resumes" className="text-xs sm:text-sm">Resumes</TabsTrigger>
          <TabsTrigger value="affiliates" className="text-xs sm:text-sm">Affiliates</TabsTrigger>
          <TabsTrigger value="saas" className="text-xs sm:text-sm">SaaS</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title="Total Users"
              value={dashboardData.userMetrics.totalUsers}
              change={`+${dashboardData.userMetrics.newUsersLast30Days} this month`}
              trend="up"
              icon={<Users className="h-4 w-4" />}
              description="All registered users"
            />
            <MetricCard
              title="Active Jobs"
              value={dashboardData.jobMetrics.activeJobs}
              change={`+${dashboardData.jobMetrics.newJobsLast30Days} this month`}
              trend="up"
              icon={<Briefcase className="h-4 w-4" />}
              description="Currently open positions"
            />
            <MetricCard
              title="Companies"
              value={dashboardData.companyMetrics.totalCompanies}
              change={`+${dashboardData.companyMetrics.newCompaniesLast30Days} this month`}
              trend="up"
              icon={<Building2 className="h-4 w-4" />}
              description="Registered companies"
            />
            <MetricCard
              title="Resumes"
              value={dashboardData.resumeMetrics.totalResumes}
              change={`+${dashboardData.resumeMetrics.newResumesLast30Days} this month`}
              trend="up"
              icon={<FileText className="h-4 w-4" />}
              description="Total resumes created"
            />
          </div>

          <div className="grid gap-4 grid-cols-1 lg:grid-cols-2 mt-4 sm:mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg sm:text-xl">User Growth (Last 90 Days)</CardTitle>
                <CardDescription className="text-sm">Daily user registrations</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart
                    data={dashboardData.userGrowthLast90Days.map(item => ({
                      ...item,
                      date: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    }))}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10 }}
                      interval="preserveStartEnd"
                    />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="count"
                      stroke="#8884d8"
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg sm:text-xl">Job Growth (Last 90 Days)</CardTitle>
                <CardDescription className="text-sm">Daily job postings</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart
                    data={dashboardData.jobGrowthLast90Days.map(item => ({
                      ...item,
                      date: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    }))}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10 }}
                      interval="preserveStartEnd"
                    />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="count"
                      stroke="#82ca9d"
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="users">
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard
              title="Total Users"
              value={dashboardData.userMetrics.totalUsers}
              icon={<Users className="h-4 w-4" />}
              description="All registered users"
            />
            <MetricCard
              title="Active Users"
              value={dashboardData.userMetrics.activeUsers}
              icon={<UserCheck className="h-4 w-4" />}
              description="Users active in last 30 days"
            />
            <MetricCard
              title="New Users"
              value={dashboardData.userMetrics.newUsersLast30Days}
              icon={<TrendingUp className="h-4 w-4" />}
              description="Registered in last 30 days"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2 mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Account Types Distribution</CardTitle>
                <CardDescription>
                  Distribution of paid and free accounts by role
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPieChart>
                      <Pie
                        data={Object.entries(
                          dashboardData.userMetrics.usersByRole,
                        ).map(([role, count]) => ({
                          name: getRoleDisplayLabel(role),
                          value: count,
                          isPaid: role === "employer" || role === "recruiter", // Assume employer and recruiter are paid
                        }))}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, value, percent }) =>
                          `${name}: ${value} (${(percent * 100).toFixed(0)}%)`
                        }
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {Object.entries(
                          dashboardData.userMetrics.usersByRole,
                        ).map((entry, index) => {
                          const colors = [
                            "#0088FE",
                            "#00C49F",
                            "#FFBB28",
                            "#FF8042",
                            "#8884D8",
                          ];
                          return (
                            <Cell
                              key={`cell-${index}`}
                              fill={colors[index % colors.length]}
                            />
                          );
                        })}
                      </Pie>
                      <Tooltip
                        formatter={(value, name) => [value, name]}
                        labelFormatter={(label) => `Account Type: ${label}`}
                      />
                      <Legend />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 space-y-2">
                  <div className="text-sm font-medium">
                    Account Status Summary:
                  </div>
                  {Object.entries(dashboardData.userMetrics.usersByRole).map(
                    ([role, count]) => {
                      const isPaid =
                        role === "employer" || role === "recruiter";
                      return (
                        <div
                          key={role}
                          className="flex justify-between items-center text-sm"
                        >
                          <span className="flex items-center gap-2">
                            <div
                              className={`w-3 h-3 rounded-full ${isPaid ? "bg-green-500" : "bg-gray-400"}`}
                            />
                            {getRoleDisplayLabel(role)}
                            <span
                              className={`px-2 py-1 rounded-full text-xs ${isPaid ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}
                            >
                              {isPaid ? "Paid" : "Free"}
                            </span>
                          </span>
                          <span className="font-medium">{count}</span>
                        </div>
                      );
                    },
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>User Growth Trend</CardTitle>
                <CardDescription>
                  90-day user registration trend
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart
                    data={dashboardData.userGrowthLast90Days.map(item => ({
                      ...item,
                      date: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    }))}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 12 }}
                      interval="preserveStartEnd"
                    />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="count"
                      stroke="#8884d8"
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="jobs">
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard
              title="Total Jobs"
              value={dashboardData.jobMetrics.totalJobs}
              icon={<Briefcase className="h-4 w-4" />}
              description="All job postings"
            />
            <MetricCard
              title="Active Jobs"
              value={dashboardData.jobMetrics.activeJobs}
              icon={<Activity className="h-4 w-4" />}
              description="Currently open positions"
            />
            <MetricCard
              title="New Jobs"
              value={dashboardData.jobMetrics.newJobsLast30Days}
              icon={<TrendingUp className="h-4 w-4" />}
              description="Posted in last 30 days"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2 mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Jobs by Status</CardTitle>
                <CardDescription>
                  Current job status distribution
                </CardDescription>
              </CardHeader>
              <CardContent>
                {Object.keys(dashboardData.jobMetrics.jobsByStatus).length > 0 ? (
                  <div className="space-y-2">
                    {Object.entries(dashboardData.jobMetrics.jobsByStatus).map(
                      ([status, count]) => (
                        <div
                          key={status}
                          className="flex justify-between items-center"
                        >
                          <span className="text-sm font-medium">{status}</span>
                          <Badge variant="secondary">{count}</Badge>
                        </div>
                      ),
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No job status data available
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Job Growth Trend</CardTitle>
                <CardDescription>90-day job posting trend</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart
                    data={dashboardData.jobGrowthLast90Days.map(item => ({
                      ...item,
                      date: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    }))}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 12 }}
                      interval="preserveStartEnd"
                    />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="count"
                      stroke="#82ca9d"
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="companies">
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard
              title="Total Companies"
              value={dashboardData.companyMetrics.totalCompanies}
              icon={<Building2 className="h-4 w-4" />}
              description="All registered companies"
            />
            <MetricCard
              title="Active Companies"
              value={dashboardData.companyMetrics.activeCompanies}
              icon={<Activity className="h-4 w-4" />}
              description="Currently active companies"
            />
            <MetricCard
              title="New Companies"
              value={dashboardData.companyMetrics.newCompaniesLast30Days}
              icon={<TrendingUp className="h-4 w-4" />}
              description="Registered in last 30 days"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2 mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Companies by Size</CardTitle>
                <CardDescription>Company size distribution</CardDescription>
              </CardHeader>
              <CardContent>
                {Object.keys(dashboardData.companyMetrics.companiesBySize).length > 0 ? (
                  <div className="space-y-2">
                    {Object.entries(
                      dashboardData.companyMetrics.companiesBySize,
                    ).map(([size, count]) => (
                      <div
                        key={size}
                        className="flex justify-between items-center"
                      >
                        <span className="text-sm font-medium">{size}</span>
                        <Badge variant="secondary">{count}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No company size data available
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Company Growth Trend</CardTitle>
                <CardDescription>
                  90-day company registration trend
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart
                    data={dashboardData.companyGrowthLast90Days.map(item => ({
                      ...item,
                      date: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    }))}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 12 }}
                      interval="preserveStartEnd"
                    />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="count"
                      stroke="#ffc658"
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="resumes">
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard
              title="Total Resumes"
              value={dashboardData.resumeMetrics.totalResumes}
              icon={<FileText className="h-4 w-4" />}
              description="All created resumes"
            />
            <MetricCard
              title="Public Resumes"
              value={dashboardData.resumeMetrics.publicResumes}
              icon={<Activity className="h-4 w-4" />}
              description="Publicly visible resumes"
            />
            <MetricCard
              title="New Resumes"
              value={dashboardData.resumeMetrics.newResumesLast30Days}
              icon={<TrendingUp className="h-4 w-4" />}
              description="Created in last 30 days"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2 mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Resumes by Type</CardTitle>
                <CardDescription>Resume format distribution</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Object.entries(
                    dashboardData.resumeMetrics.resumesByType,
                  ).map(([type, count]) => (
                    <div
                      key={type}
                      className="flex justify-between items-center"
                    >
                      <span className="text-sm font-medium">{type}</span>
                      <Badge variant="secondary">{count}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Resume Growth Trend</CardTitle>
                <CardDescription>90-day resume creation trend</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart
                    data={dashboardData.resumeGrowthLast90Days.map(item => ({
                      ...item,
                      date: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    }))}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 12 }}
                      interval="preserveStartEnd"
                    />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="count"
                      stroke="#ff7300"
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="saas">
          {dashboardData.saasMetrics ? (
            <>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <MetricCard
                  title="MRR"
                  value={`$${dashboardData.saasMetrics.monthlyRecurringRevenue.toLocaleString()}`}
                  change={`${dashboardData.saasMetrics.growthRate > 0 ? "+" : ""}${dashboardData.saasMetrics.growthRate.toFixed(1)}%`}
                  trend={dashboardData.saasMetrics.growthRate > 0 ? "up" : "down"}
                  icon={<DollarSign className="h-4 w-4" />}
                  description="Monthly Recurring Revenue"
                />
                <MetricCard
                  title="ARR"
                  value={`$${dashboardData.saasMetrics.annualRecurringRevenue.toLocaleString()}`}
                  icon={<BarChart3 className="h-4 w-4" />}
                  description="Annual Recurring Revenue"
                />
                <MetricCard
                  title="ARPU"
                  value={`$${dashboardData.saasMetrics.averageRevenuePerUser.toFixed(2)}`}
                  icon={<Users className="h-4 w-4" />}
                  description="Average Revenue Per User"
                />
                <MetricCard
                  title="Churn Rate"
                  value={`${dashboardData.saasMetrics.churnRate.toFixed(1)}%`}
                  trend={dashboardData.saasMetrics.churnRate < 5 ? "up" : "down"}
                  icon={<TrendingDown className="h-4 w-4" />}
                  description="Monthly churn rate"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mt-4">
                <MetricCard
                  title="LTV"
                  value={`$${dashboardData.saasMetrics.customerLifetimeValue.toLocaleString()}`}
                  icon={<Activity className="h-4 w-4" />}
                  description="Customer Lifetime Value"
                />
                <MetricCard
                  title="CAC"
                  value={`$${dashboardData.saasMetrics.customerAcquisitionCost.toFixed(2)}`}
                  icon={<TrendingUp className="h-4 w-4" />}
                  description="Customer Acquisition Cost"
                />
                <MetricCard
                  title="Conversion Rate"
                  value={`$${dashboardData.saasMetrics.conversionRate.toFixed(1)}%`}
                  icon={<PieChart className="h-4 w-4" />}
                  description="Trial to paid conversion"
                />
                <MetricCard
                  title="Active Subscriptions"
                  value={dashboardData.saasMetrics.activeSubscriptions}
                  icon={<UserCheck className="h-4 w-4" />}
                  description="Currently active subscriptions"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2 mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Revenue by Tier</CardTitle>
                    <CardDescription>
                      Monthly revenue breakdown by subscription tier
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {Object.entries(dashboardData.saasMetrics.revenueByTier).map(
                        ([tier, revenue]) => (
                          <div
                            key={tier}
                            className="flex justify-between items-center"
                          >
                            <span className="text-sm font-medium">{tier}</span>
                            <Badge variant="secondary">
                              ${revenue.toLocaleString()}
                            </Badge>
                          </div>
                        ),
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Revenue Distribution by Account Type</CardTitle>
                    <CardDescription>
                      Financial breakdown of paid accounts
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <RechartsPieChart>
                          <Pie
                            data={Object.entries(
                              dashboardData.saasMetrics.revenueByTier,
                            ).map(([tier, revenue]) => ({
                              name: tier
                                .replace("_", " ")
                                .replace(/\b\w/g, (l) => l.toUpperCase()),
                              value: revenue,
                              subscriptions:
                                dashboardData.saasMetrics.subscriptionsByTier[
                                  tier
                                ] || 0,
                            }))}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={({ name, value, percent }) =>
                              `${name}: $${value.toLocaleString()} (${(percent * 100).toFixed(1)}%)`
                            }
                            outerRadius={80}
                            fill="#8884d8"
                            dataKey="value"
                          >
                            {Object.entries(
                              dashboardData.saasMetrics.revenueByTier,
                            ).map((_entry, index) => {
                              const colors = [
                                "#00C49F",
                                "#0088FE",
                                "#FFBB28",
                                "#FF8042",
                                "#8884D8",
                              ];
                              return (
                                <Cell
                                  key={`cell-${index}`}
                                  fill={colors[index % colors.length]}
                                />
                              );
                            })}
                          </Pie>
                          <Tooltip
                            formatter={(value, name, props) => [
                              `$${value.toLocaleString()}`,
                              `${name} (${props.payload.subscriptions} accounts)`,
                            ]}
                            labelFormatter={(label) => `Revenue from ${label}`}
                          />
                          <Legend />
                        </RechartsPieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-4 space-y-2">
                      <div className="text-sm font-medium">Subscription Tiers:</div>
                      {Object.entries(
                        dashboardData.saasMetrics.subscriptionsByTier,
                      ).map(([tier, count]) => {
                        const revenue =
                          dashboardData.saasMetrics.revenueByTier[tier] || 0;
                        const avgRevenue = count > 0 ? revenue / count : 0;
                        return (
                          <div
                            key={tier}
                            className="flex justify-between items-center text-sm"
                          >
                            <span className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-blue-500" />
                              {tier
                                .replace("_", " ")
                                .replace(/\b\w/g, (l) => l.toUpperCase())}
                            </span>
                            <div className="text-right">
                              <div className="font-medium">{count} accounts</div>
                              <div className="text-xs text-muted-foreground">
                                ${revenue.toLocaleString()} total ($
                                {avgRevenue.toFixed(0)}/avg)
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                SaaS metrics are not available yet. This data will be populated once subscription data is available.
              </p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="affiliates" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {/* Overview Metrics */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Affiliates</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {affiliateStats?.totalAffiliates || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  {affiliateStats?.activeAffiliates || 0} active
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">New This Month</CardTitle>
                <UserPlus className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {affiliateStats?.newAffiliatesThisMonth || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  New affiliates
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Referrals</CardTitle>
                <Share2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {affiliateStats?.totalReferrals || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  {affiliateStats?.totalConversions || 0} conversions
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {affiliateStats?.conversionRate?.toFixed(1) || 0}%
                </div>
                <p className="text-xs text-muted-foreground">
                  Overall conversion
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {/* Payout Metrics */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pending Payouts</CardTitle>
                <CreditCard className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  ${((affiliateStats?.pendingPayoutsCents || 0) / 100).toFixed(2)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {affiliateStats?.pendingPayouts || 0} requests
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Paid</CardTitle>
                <Banknote className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  ${((affiliateStats?.totalCommissionsPaidCents || 0) / 100).toFixed(2)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {affiliateStats?.completedPayouts || 0} completed
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Commission</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  ${affiliateStats?.completedPayouts ?
                    ((affiliateStats.totalCommissionsPaidCents / affiliateStats.completedPayouts) / 100).toFixed(2) :
                    '0.00'
                  }
                </div>
                <p className="text-xs text-muted-foreground">
                  Per payout
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Processing</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {(affiliateStats?.pendingPayouts || 0) + (affiliateStats?.completedPayouts || 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Total payouts
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Top Performers Table */}
          <Card>
            <CardHeader>
              <CardTitle>Top Performing Affiliates</CardTitle>
              <CardDescription>
                Highest earning affiliates this period
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {affiliateStats?.topPerformers?.length ? (
                  affiliateStats.topPerformers.map((affiliate, index) => (
                    <div key={affiliate.userId} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center space-x-4">
                        <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                          <span className="text-sm font-medium">#{index + 1}</span>
                        </div>
                        <div>
                          <p className="font-medium">{affiliate.userName}</p>
                          <p className="text-sm text-muted-foreground">
                            {affiliate.totalReferrals} referrals • {affiliate.totalConversions} conversions
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">${(affiliate.totalCommissionCents / 100).toFixed(2)}</p>
                        <p className="text-sm text-muted-foreground">
                          {affiliate.totalConversions > 0 ?
                            ((affiliate.totalConversions / affiliate.totalReferrals) * 100).toFixed(1) :
                            '0'
                          }% conversion
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No affiliate data available
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Recent Payouts Table */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Payouts</CardTitle>
              <CardDescription>
                Latest affiliate payout transactions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {affiliateStats?.recentPayouts?.length ? (
                  affiliateStats.recentPayouts.map((payout) => (
                    <div key={payout.payoutId} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center space-x-4">
                        <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                          <DollarSign className="h-4 w-4 text-green-600" />
                        </div>
                        <div>
                          <p className="font-medium">{payout.affiliateUserName}</p>
                          <p className="text-sm text-muted-foreground">
                            {new Date(payout.requestedAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">${(payout.amountCents / 100).toFixed(2)}</p>
                        <p className={`text-sm ${
                          payout.status === 'Paid' ? 'text-green-600' :
                          payout.status === 'Processing' ? 'text-yellow-600' :
                          payout.status === 'Failed' ? 'text-red-600' :
                          'text-muted-foreground'
                        }`}>
                          {payout.status}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No recent payouts
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Affiliate Management Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Affiliate Management</CardTitle>
              <CardDescription>
                Administrative actions for affiliate program
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <Button variant="outline" className="h-20 flex flex-col items-center justify-center space-y-2">
                  <Users className="h-6 w-6" />
                  <span>Manage Affiliates</span>
                </Button>
                <Button variant="outline" className="h-20 flex flex-col items-center justify-center space-y-2">
                  <CreditCard className="h-6 w-6" />
                  <span>Process Payouts</span>
                </Button>
                <Button variant="outline" className="h-20 flex flex-col items-center justify-center space-y-2">
                  <RotateCcw className="h-6 w-6" />
                  <span>Refund Management</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
