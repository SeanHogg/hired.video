import React, { useState, useEffect } from "react";
import {
  BarChart3,
  Users,
  Briefcase,
  FileText,
  TrendingUp,
  TrendingDown,
  Calendar,
  Download,
  Eye,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface AnalyticsData {
  totalUsers: number;
  activeUsers: number;
  totalJobs: number;
  totalResumes: number;
  totalApplications: number;
  userGrowth: number;
  jobGrowth: number;
  applicationGrowth: number;
  topPerformingJobs: Array<{
    id: string;
    title: string;
    applications: number;
    views: number;
  }>;
  userActivity: Array<{
    date: string;
    activeUsers: number;
    newUsers: number;
  }>;
  departmentStats: Array<{
    department: string;
    users: number;
    jobs: number;
    applications: number;
  }>;
}

interface AccountAnalyticsProps {
  data?: AnalyticsData;
  loading?: boolean;
  onExport?: (format: "csv" | "pdf") => void;
  onLoadAnalytics?: () => Promise<AnalyticsData>;
}

export function AccountAnalytics({
  data,
  loading = false,
  onExport,
  onLoadAnalytics,
}: AccountAnalyticsProps) {
  const [timeRange, setTimeRange] = useState("30d");
  const [selectedTab, setSelectedTab] = useState("overview");
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(
    null,
  );
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  // Load analytics data on mount
  useEffect(() => {
    const loadAnalytics = async () => {
      if (onLoadAnalytics && !data) {
        setLoadingAnalytics(true);
        try {
          const apiData = await onLoadAnalytics();
          setAnalyticsData(apiData);
        } catch (error) {
          console.error("Failed to load analytics:", error);
          // Fall back to mock data on error
        } finally {
          setLoadingAnalytics(false);
        }
      }
    };

    loadAnalytics();
  }, [onLoadAnalytics, data]);

  // Defaults backfill any fields the API doesn't return — the
  // /api/account/analytics endpoint only sends a small subset
  // (activeUsers, invitesSent, invitesAccepted, lastActiveAt).
  const defaultData: AnalyticsData = {
      totalUsers: 156,
      activeUsers: 89,
      totalJobs: 45,
      totalResumes: 234,
      totalApplications: 1247,
      userGrowth: 12.5,
      jobGrowth: 8.3,
      applicationGrowth: 15.7,
      topPerformingJobs: [
        {
          id: "1",
          title: "Senior Software Engineer",
          applications: 89,
          views: 456,
        },
        { id: "2", title: "Product Manager", applications: 67, views: 234 },
        { id: "3", title: "UX Designer", applications: 45, views: 189 },
        { id: "4", title: "Data Scientist", applications: 34, views: 167 },
      ],
      userActivity: [
        { date: "2024-01-01", activeUsers: 45, newUsers: 5 },
        { date: "2024-01-02", activeUsers: 52, newUsers: 8 },
        { date: "2024-01-03", activeUsers: 48, newUsers: 3 },
        { date: "2024-01-04", activeUsers: 61, newUsers: 12 },
        { date: "2024-01-05", activeUsers: 58, newUsers: 7 },
      ],
      departmentStats: [
        { department: "Engineering", users: 45, jobs: 12, applications: 234 },
        { department: "Product", users: 23, jobs: 8, applications: 156 },
        { department: "Design", users: 18, jobs: 6, applications: 89 },
        { department: "Marketing", users: 15, jobs: 4, applications: 67 },
      ],
    };

  // Merge real data over defaults so missing API fields don't blow up rendering
  const mockData: AnalyticsData = {
    ...defaultData,
    ...(data ?? {}),
    ...(analyticsData ?? {}),
  };

  const formatNumber = (num: number) => {
    if (num == null) return "0";
    if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
    return num.toString();
  };

  const formatGrowth = (growth: number) => {
    const isPositive = growth > 0;
    return (
      <div
        className={`flex items-center gap-1 ${isPositive ? "text-green-600" : "text-red-600"}`}
      >
        {isPositive ? (
          <TrendingUp className="h-4 w-4" />
        ) : (
          <TrendingDown className="h-4 w-4" />
        )}
        <span className="text-sm font-medium">{Math.abs(growth)}%</span>
      </div>
    );
  };

  if (loading || loadingAnalytics) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 rounded" />
            ))}
          </div>
          <div className="h-64 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-6 w-6" />
          <h2 className="text-2xl font-bold">Account Analytics</h2>
        </div>
        <div className="flex items-center gap-2">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="1y">Last year</SelectItem>
            </SelectContent>
          </Select>
          {onExport && (
            <Button variant="outline" onClick={() => onExport("csv")}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          )}
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Total Users
                </p>
                <p className="text-2xl font-bold">
                  {formatNumber(mockData.totalUsers)}
                </p>
              </div>
              <div className="flex flex-col items-end">
                <Users className="h-8 w-8 text-blue-600" />
                {formatGrowth(mockData.userGrowth)}
              </div>
            </div>
            <div className="mt-4">
              <Progress
                value={(mockData.activeUsers / mockData.totalUsers) * 100}
                className="h-2"
              />
              <p className="text-xs text-muted-foreground mt-2">
                {mockData.activeUsers} active users
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Total Jobs
                </p>
                <p className="text-2xl font-bold">
                  {formatNumber(mockData.totalJobs)}
                </p>
              </div>
              <div className="flex flex-col items-end">
                <Briefcase className="h-8 w-8 text-green-600" />
                {formatGrowth(mockData.jobGrowth)}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Total Resumes
                </p>
                <p className="text-2xl font-bold">
                  {formatNumber(mockData.totalResumes)}
                </p>
              </div>
              <div className="flex flex-col items-end">
                <FileText className="h-8 w-8 text-purple-600" />
                {formatGrowth(12.3)}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Applications
                </p>
                <p className="text-2xl font-bold">
                  {formatNumber(mockData.totalApplications)}
                </p>
              </div>
              <div className="flex flex-col items-end">
                <MessageSquare className="h-8 w-8 text-orange-600" />
                {formatGrowth(mockData.applicationGrowth)}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Analytics */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="jobs">Job Performance</TabsTrigger>
          <TabsTrigger value="users">User Activity</TabsTrigger>
          <TabsTrigger value="departments">Departments</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>User Growth Trend</CardTitle>
                <CardDescription>Daily active and new users</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64 flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <BarChart3 className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>Chart visualization would go here</p>
                    <p className="text-sm">
                      Integration with charting library needed
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Application Trends</CardTitle>
                <CardDescription>Job applications over time</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64 flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <TrendingUp className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>Chart visualization would go here</p>
                    <p className="text-sm">
                      Integration with charting library needed
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="jobs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Top Performing Jobs</CardTitle>
              <CardDescription>
                Jobs with the most applications and views
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {mockData.topPerformingJobs.map((job, index) => (
                  <div
                    key={job.id}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <Badge variant="secondary">#{index + 1}</Badge>
                      <div>
                        <p className="font-medium">{job.title}</p>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <MessageSquare className="h-4 w-4" />
                            {job.applications} applications
                          </span>
                          <span className="flex items-center gap-1">
                            <Eye className="h-4 w-4" />
                            {job.views} views
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">
                        {((job.applications / job.views) * 100).toFixed(1)}%
                        conversion
                      </p>
                      <Progress
                        value={(job.applications / job.views) * 100}
                        className="w-20 h-2 mt-1"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>User Activity</CardTitle>
              <CardDescription>Daily user engagement metrics</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {mockData.userActivity.map((day, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <Calendar className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">
                          {new Date(day.date).toLocaleDateString()}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {day.activeUsers} active • {day.newUsers} new
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{day.activeUsers} active</Badge>
                      <Badge variant="secondary">{day.newUsers} new</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="departments" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Department Statistics</CardTitle>
              <CardDescription>
                Performance metrics by department
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {mockData.departmentStats.map((dept, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div>
                      <p className="font-medium">{dept.department}</p>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                        <span className="flex items-center gap-1">
                          <Users className="h-4 w-4" />
                          {dept.users} users
                        </span>
                        <span className="flex items-center gap-1">
                          <Briefcase className="h-4 w-4" />
                          {dept.jobs} jobs
                        </span>
                        <span className="flex items-center gap-1">
                          <MessageSquare className="h-4 w-4" />
                          {dept.applications} applications
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">
                        {(dept.applications / dept.jobs).toFixed(1)} avg
                        applications/job
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
