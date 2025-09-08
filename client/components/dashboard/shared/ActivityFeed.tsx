import React from "react";
import { Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { ActivityItem } from "@/lib/services/dashboard-service";

interface ActivityFeedProps {
  activities: ActivityItem[];
  title?: string;
  loading?: boolean;
  showViewAll?: boolean;
  onViewAll?: () => void;
  emptyMessage?: string;
  maxItems?: number;
}

export function ActivityFeed({
  activities,
  title = "Recent Activity",
  loading = false,
  showViewAll = true,
  onViewAll,
  emptyMessage = "No recent activity",
  maxItems = 10,
}: ActivityFeedProps) {
  const displayActivities = activities.slice(0, maxItems);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          // Loading skeleton
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg"
              >
                <div className="w-2 h-2 bg-gray-200 rounded-full mt-2 flex-shrink-0 animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-3/4 bg-gray-200 rounded animate-pulse" />
                  <div className="h-3 w-1/2 bg-gray-200 rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : displayActivities.length > 0 ? (
          <>
            {displayActivities.map((activity, index) => (
              <div
                key={activity.id || index}
                className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg hover:bg-muted/40 transition-colors"
              >
                <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium">{activity.content}</p>
                  <p className="text-xs text-muted-foreground">
                    {activity.time}
                  </p>
                  {activity.url && (
                    <a
                      href={activity.url}
                      className="text-xs text-primary hover:underline"
                    >
                      View details
                    </a>
                  )}
                </div>
              </div>
            ))}
            {showViewAll && (
              <Button variant="outline" className="w-full" onClick={onViewAll}>
                View All Activity
              </Button>
            )}
          </>
        ) : (
          <div className="text-center py-8">
            <Clock className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">{emptyMessage}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ActivityFeed;
