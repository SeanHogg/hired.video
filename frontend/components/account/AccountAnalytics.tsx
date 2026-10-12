import React, { useState, useEffect } from "react";
import {
  BarChart3,
  Users,
  Briefcase,
  FileText,
  TrendingUp,
  TrendingDown,
  Download,
  MessageSquare,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface AnalyticsData {
  totalUsers?: number;
  activeUsers?: number;
  totalJobs?: number;
  totalResumes?: number;
  totalApplications?: number;
  userGrowth?: number;
  jobGrowth?: number;
  applicationGrowth?: number;
  invitesSent?: number;
  invitesAccepted?: number;
  lastActiveAt?: string | null;
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
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(
    null,
  );
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const loadAnalytics = async () => {
      if (onLoadAnalytics && !data) {
        setLoadingAnalytics(true);
        setLoadError(null);
        try {
          const apiData = await onLoadAnalytics();
          setAnalyticsData(apiData ?? {});
        } catch (error) {
          console.error("Failed to load analytics:", error);
          setLoadError("Failed to load account analytics.");
        } finally {
          setLoadingAnalytics(false);
        }
      }
    };

    loadAnalytics();
  }, [onLoadAnalytics, data]);

  const merged: AnalyticsData = { ...(data ?? {}), ...(analyticsData ?? {}) };

  const formatNumber = (num: number | undefined | null) => {
    if (num == null) return "—";
    if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
    return num.toString();
  };

  const formatGrowth = (growth: number | undefined) => {
    if (growth == null) return null;
    const isPositive = growth >= 0;
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
          <div className="h-8 bg-muted rounded w-1/4 mb-4" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-muted rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          {loadError}
        </CardContent>
      </Card>
    );
  }

  const totalUsers = merged.totalUsers ?? 0;
  const activeUsers = merged.activeUsers ?? 0;
  const activePct =
    totalUsers > 0 ? Math.min(100, (activeUsers / totalUsers) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-6 w-6" />
          <h2 className="text-2xl font-bold">Account Analytics</h2>
        </div>
        {onExport && (
          <Button variant="outline" onClick={() => onExport("csv")}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        )}
      </div>

      {/* Key Metrics — real data only */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Total Users
                </p>
                <p className="text-2xl font-bold">{formatNumber(merged.totalUsers)}</p>
              </div>
              <div className="flex flex-col items-end">
                <Users className="h-8 w-8 text-primary" />
                {formatGrowth(merged.userGrowth)}
              </div>
            </div>
            {totalUsers > 0 && (
              <div className="mt-4">
                <Progress value={activePct} className="h-2" />
                <p className="text-xs text-muted-foreground mt-2">
                  {activeUsers} active in last 30 days
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Total Jobs
                </p>
                <p className="text-2xl font-bold">{formatNumber(merged.totalJobs)}</p>
              </div>
              <div className="flex flex-col items-end">
                <Briefcase className="h-8 w-8 text-green-600" />
                {formatGrowth(merged.jobGrowth)}
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
                <p className="text-2xl font-bold">{formatNumber(merged.totalResumes)}</p>
              </div>
              <FileText className="h-8 w-8 text-primary" />
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
                  {formatNumber(merged.totalApplications)}
                </p>
              </div>
              <div className="flex flex-col items-end">
                <MessageSquare className="h-8 w-8 text-amber-600" />
                {formatGrowth(merged.applicationGrowth)}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Invitations summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Team Invitations
          </CardTitle>
          <CardDescription>
            Lifetime invitation activity for this account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-accent">
              <p className="text-xs text-muted-foreground">Sent</p>
              <p className="text-2xl font-bold text-primary">
                {formatNumber(merged.invitesSent)}
              </p>
            </div>
            <div className="p-4 rounded-lg bg-green-50">
              <p className="text-xs text-muted-foreground">Accepted</p>
              <p className="text-2xl font-bold text-green-700">
                {formatNumber(merged.invitesAccepted)}
              </p>
            </div>
            <div className="p-4 rounded-lg bg-muted">
              <p className="text-xs text-muted-foreground">Last active</p>
              <p className="text-sm font-medium text-foreground mt-2">
                {merged.lastActiveAt
                  ? new Date(merged.lastActiveAt).toLocaleString()
                  : "Never"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
