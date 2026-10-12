import React, { useState, useEffect } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  TrendingUp,
  Users,
  AlertTriangle,
  Download,
  RefreshCw,
  Target,
  Clock,
  Calendar,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { accountService } from "@/lib/services/account-service";
import { toast } from "@/hooks/use-toast";

interface InvitationAnalyticsData {
  companyName: string;
  totalInvitations: number;
  acceptedInvitations: number;
  pendingInvitations: number;
  expiredInvitations: number;
  rejectedInvitations: number;
  acceptanceRate: number;
  recentInvitations30Days: number;
  recentAccepted30Days: number;
  weeklyInvitations: number;
  roleDistribution: Record<string, number>;
  monthlyTrends: Array<{
    month: string;
    invitationsSent: number;
    invitationsAccepted: number;
    acceptanceRate: number;
  }>;
}

interface InvitationAnalyticsProps {
  onExport?: () => void;
}

export function InvitationAnalytics({ onExport }: InvitationAnalyticsProps) {
  const [data, setData] = useState<InvitationAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await accountService.getInvitationAnalytics();
      const raw = (response ?? {}) as Partial<InvitationAnalyticsData> &
        Record<string, any>;
      const total = raw.totalInvitations ?? raw.total ?? 0;
      const accepted = raw.acceptedInvitations ?? raw.accepted ?? 0;
      const pending = raw.pendingInvitations ?? raw.pending ?? 0;
      const expired = raw.expiredInvitations ?? raw.expired ?? 0;
      const rejected = raw.rejectedInvitations ?? raw.rejected ?? 0;
      const normalized: InvitationAnalyticsData = {
        companyName: raw.companyName ?? "",
        totalInvitations: total,
        acceptedInvitations: accepted,
        pendingInvitations: pending,
        expiredInvitations: expired,
        rejectedInvitations: rejected,
        acceptanceRate:
          raw.acceptanceRate ?? (total > 0 ? Math.round((accepted / total) * 100) : 0),
        recentInvitations30Days: raw.recentInvitations30Days ?? 0,
        recentAccepted30Days: raw.recentAccepted30Days ?? 0,
        weeklyInvitations: raw.weeklyInvitations ?? 0,
        roleDistribution: raw.roleDistribution ?? {},
        monthlyTrends: raw.monthlyTrends ?? [],
      };
      setData(normalized);
    } catch (err) {
      console.error("Error loading invitation analytics:", err);
      setError("Failed to load invitation analytics");
      toast({
        title: "Error",
        description: "Failed to load invitation analytics",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    if (!data) return;

    // Create CSV content
    const csvContent = [
      ["Metric", "Value"],
      ["Total Invitations", data.totalInvitations],
      ["Accepted Invitations", data.acceptedInvitations],
      ["Pending Invitations", data.pendingInvitations],
      ["Expired Invitations", data.expiredInvitations],
      ["Rejected Invitations", data.rejectedInvitations],
      ["Acceptance Rate (%)", data.acceptanceRate],
      ["Recent Invitations (30 days)", data.recentInvitations30Days],
      ["Recent Accepted (30 days)", data.recentAccepted30Days],
      ["Weekly Invitations", data.weeklyInvitations],
      ...Object.entries(data.roleDistribution).map(([role, count]) => [
        `Role: ${role}`,
        count,
      ]),
    ]
      .map((row) => row.join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `invitation-analytics-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);

    if (onExport) onExport();
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="animate-pulse">
                  <div className="h-4 bg-muted rounded w-3/4 mb-2" />
                  <div className="h-8 bg-muted rounded w-1/2" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardContent className="p-6">
            <div className="animate-pulse">
              <div className="h-64 bg-muted rounded" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">
            Unable to Load Analytics
          </h3>
          <p className="text-muted-foreground mb-4">{error || "No data available"}</p>
          <Button onClick={loadAnalytics}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  const statusData = [
    { name: "Accepted", value: data.acceptedInvitations, color: "#00C49F" },
    { name: "Pending", value: data.pendingInvitations, color: "#FFBB28" },
    { name: "Expired", value: data.expiredInvitations, color: "#FF8042" },
    { name: "Rejected", value: data.rejectedInvitations, color: "#8884D8" },
  ].filter((item) => item.value > 0);

  const roleData = Object.entries(data.roleDistribution).map(
    ([role, count]) => ({
      name: role,
      value: count,
    }),
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold">Invitation Analytics</h2>
          <p className="text-muted-foreground">
            Track your team invitation performance for {data.companyName}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={loadAnalytics}
            variant="outline"
            size="sm"
            disabled={loading}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
          <Button onClick={handleExport} variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Total Invitations
                </p>
                <p className="text-3xl font-bold">{data.totalInvitations}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {data.recentInvitations30Days} in last 30 days
                </p>
              </div>
              <Users className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Acceptance Rate
                </p>
                <p className="text-3xl font-bold text-green-600">
                  {data.acceptanceRate}%
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {data.acceptedInvitations} accepted
                </p>
              </div>
              <Target className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Pending Invitations
                </p>
                <p className="text-3xl font-bold text-yellow-600">
                  {data.pendingInvitations}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Awaiting response</p>
              </div>
              <Clock className="h-8 w-8 text-yellow-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Weekly Activity
                </p>
                <p className="text-3xl font-bold text-primary">
                  {data.weeklyInvitations}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Invitations this week
                </p>
              </div>
              <Calendar className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Trends */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Monthly Trends
            </CardTitle>
            <CardDescription>
              Invitation activity over the last 12 months
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data.monthlyTrends}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="invitationsSent"
                  stroke="#8884d8"
                  name="Sent"
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="invitationsAccepted"
                  stroke="#82ca9d"
                  name="Accepted"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Status Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Invitation Status Distribution</CardTitle>
            <CardDescription>Current status of all invitations</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) =>
                    `${name} ${(percent * 100).toFixed(0)}%`
                  }
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Role Distribution */}
      {roleData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Role Distribution</CardTitle>
            <CardDescription>
              Distribution of roles among accepted team members
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={roleData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#8884d8" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Recent Activity Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity Summary</CardTitle>
          <CardDescription>Key metrics from the last 30 days</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-accent rounded-lg">
              <p className="text-2xl font-bold text-primary">
                {data.recentInvitations30Days}
              </p>
              <p className="text-sm text-muted-foreground">Invitations Sent</p>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <p className="text-2xl font-bold text-green-600">
                {data.recentAccepted30Days}
              </p>
              <p className="text-sm text-muted-foreground">Invitations Accepted</p>
            </div>
            <div className="text-center p-4 bg-accent rounded-lg">
              <p className="text-2xl font-bold text-primary">
                {data.recentInvitations30Days > 0
                  ? Math.round(
                      (data.recentAccepted30Days /
                        data.recentInvitations30Days) *
                        100,
                    )
                  : 0}
                %
              </p>
              <p className="text-sm text-muted-foreground">Recent Acceptance Rate</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
