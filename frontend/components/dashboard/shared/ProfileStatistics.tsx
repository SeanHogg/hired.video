import React from "react";
import { Eye } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProfileStats } from "@/lib/services/dashboard-service";

interface ProfileStatisticsProps {
  stats?: ProfileStats | null;
  loading?: boolean;
}

export function ProfileStatistics({ stats, loading = false }: ProfileStatisticsProps) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Eye className="h-4 w-4 sm:h-5 sm:w-5" />
            {t("headings.profileStatistics")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 sm:gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="text-center p-2 sm:p-3 bg-muted/30 rounded-lg animate-pulse">
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
        <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
          <Eye className="h-4 w-4 sm:h-5 sm:w-5" />
          {t("headings.profileStatistics")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2 sm:gap-4 mb-4">
          <div className="text-center p-2 sm:p-3 bg-muted/30 rounded-lg">
            <div className="text-lg sm:text-2xl font-bold text-primary">
              {stats?.totalViews ?? 0}
            </div>
            <div className="text-xs text-muted-foreground">{t("metrics.totalViews")}</div>
          </div>
          <div className="text-center p-2 sm:p-3 bg-muted/30 rounded-lg">
            <div className="text-lg sm:text-2xl font-bold text-blue-600">
              {stats?.viewsThisWeek ?? 0}
            </div>
            <div className="text-xs text-muted-foreground">{t("metrics.thisWeek")}</div>
          </div>
          <div className="text-center p-2 sm:p-3 bg-muted/30 rounded-lg">
            <div className="text-lg sm:text-2xl font-bold text-green-600">
              {stats?.viewsThisMonth ?? 0}
            </div>
            <div className="text-xs text-muted-foreground">{t("metrics.thisMonth")}</div>
          </div>
          <div className="text-center p-2 sm:p-3 bg-muted/30 rounded-lg">
            <div
              className={`text-lg sm:text-2xl font-bold ${(stats?.viewsChangePercentage ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`}
            >
              {(stats?.viewsChangePercentage ?? 0) >= 0 ? "+" : ""}
              {stats?.viewsChangePercentage ?? 0}%
            </div>
            <div className="text-xs text-muted-foreground">{t("metrics.change")}</div>
          </div>
        </div>

        {/* Recent Viewers */}
        {stats?.recentViewers && stats.recentViewers.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">
              {t("headings.recentViewers")}
            </h4>
            {stats.recentViewers.slice(0, 3).map((viewer, index) => (
              <div
                key={viewer.userId || index}
                className="flex items-center justify-between p-2 bg-muted/20 rounded"
              >
                <div>
                  <div className="text-sm font-medium">{viewer.name}</div>
                  {viewer.company && (
                    <div className="text-xs text-muted-foreground">
                      {viewer.company}
                    </div>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {new Date(viewer.viewedAt).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ProfileStatistics;
