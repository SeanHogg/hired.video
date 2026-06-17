import React from "react";
import { FileText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ApplicationStats } from "@/lib/services/dashboard-service";

interface ApplicationStatisticsProps {
  stats?: ApplicationStats | null;
  loading?: boolean;
}

export function ApplicationStatistics({ stats, loading = false }: ApplicationStatisticsProps) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {t("headings.applicationStatistics")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="text-center p-3 bg-muted/30 rounded-lg animate-pulse">
                <div className="h-6 w-12 bg-muted rounded mx-auto mb-1" />
                <div className="h-3 w-16 bg-muted rounded mx-auto" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          {t("headings.applicationStatistics")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="text-center p-3 bg-muted/30 rounded-lg">
            <div className="text-2xl font-bold text-primary">
              {stats?.totalApplications ?? 0}
            </div>
            <div className="text-xs text-muted-foreground">{t("metrics.totalApplications")}</div>
          </div>
          <div className="text-center p-3 bg-muted/30 rounded-lg">
            <div className="text-2xl font-bold text-yellow-600">
              {stats?.pendingApplications ?? 0}
            </div>
            <div className="text-xs text-muted-foreground">{t("metrics.pending")}</div>
          </div>
          <div className="text-center p-3 bg-muted/30 rounded-lg">
            <div className="text-2xl font-bold text-green-600">
              {stats?.interviewRequests ?? 0}
            </div>
            <div className="text-xs text-muted-foreground">{t("metrics.interviews")}</div>
          </div>
          <div className="text-center p-3 bg-muted/30 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">
              {stats?.successRate ?? 0}%
            </div>
            <div className="text-xs text-muted-foreground">{t("metrics.successRate")}</div>
          </div>
        </div>

        {/* Recent Applications */}
        {stats?.recentApplications && stats.recentApplications.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">
              {t("headings.recentApplications")}
            </h4>
            {stats.recentApplications.slice(0, 3).map((app, index) => (
              <div
                key={app.applicationId || index}
                className="flex items-center justify-between p-2 bg-muted/20 rounded"
              >
                <div>
                  <div className="text-sm font-medium">{app.jobTitle}</div>
                  <div className="text-xs text-muted-foreground">{app.company}</div>
                </div>
                <Badge
                  variant={
                    app.status === "pending"
                      ? "secondary"
                      : app.status === "accepted"
                        ? "default"
                        : "destructive"
                  }
                  className="text-xs"
                >
                  {app.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ApplicationStatistics;
