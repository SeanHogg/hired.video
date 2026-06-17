import React from "react";
import { TrendingUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardMetric } from "@/lib/services/dashboard-service";

interface MetricCardProps {
  metric: DashboardMetric;
  loading?: boolean;
}

interface MetricGridProps {
  metrics: DashboardMetric[];
  loading?: boolean;
  emptyMessage?: string;
}

export function MetricCard({ metric, loading = false }: MetricCardProps) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="h-4 w-24 bg-muted rounded animate-pulse" />
          <div className="h-4 w-4 bg-muted rounded animate-pulse" />
        </CardHeader>
        <CardContent>
          <div className="h-8 w-16 bg-muted rounded animate-pulse mb-2" />
          <div className="h-3 w-20 bg-muted rounded animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {metric.title}
        </CardTitle>
        {metric.icon &&
          React.createElement(metric.icon, {
            className: "h-4 w-4 text-muted-foreground",
          })}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{metric.value}</div>
        {metric.change && (
          <div
            className={`text-xs flex items-center gap-1 ${
              metric.trend === "up" ? "text-green-600" : "text-red-600"
            }`}
          >
            <TrendingUp
              className={`h-3 w-3 ${metric.trend === "down" ? "rotate-180" : ""}`}
            />
            {t("metrics.fromLastMonth", { change: metric.change })}
          </div>
        )}
        {metric.description && (
          <p className="text-xs text-muted-foreground mt-1">
            {metric.description}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function MetricGrid({
  metrics,
  loading = false,
  emptyMessage,
}: MetricGridProps) {
  const { t } = useTranslation();
  const resolvedEmpty = emptyMessage ?? t("messages.noMetricsAvailable");
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {Array.from({ length: 4 }).map((_, index) => (
          <MetricCard
            key={index}
            metric={{} as DashboardMetric}
            loading={true}
          />
        ))}
      </div>
    );
  }

  if (!metrics || metrics.length === 0) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="col-span-full text-center py-8">
          <TrendingUp className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">{t("headings.noMetricsAvailable")}</h3>
          <p className="text-muted-foreground">{resolvedEmpty}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {metrics.map((metric, index) => (
        <MetricCard key={index} metric={metric} />
      ))}
    </div>
  );
}
