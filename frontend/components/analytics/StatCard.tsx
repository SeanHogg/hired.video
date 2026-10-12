/**
 * StatCard — single tile in the top row of <MetricsPanel/>. Pulled out
 * of VideoAnalyticsDashboard so every artifact's stat row renders
 * identically (same skeleton width, same icon size, same typography).
 */

import React from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  title: string;
  value: string | number;
  icon: React.ElementType;
  loading?: boolean;
}

export default function StatCard({ title, value, icon: Icon, loading }: Props) {
  if (loading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="h-4 w-24 bg-muted rounded animate-pulse" />
          <div className="h-4 w-4 bg-muted rounded animate-pulse" />
        </CardHeader>
        <CardContent>
          <div className="h-8 w-16 bg-muted rounded animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}
