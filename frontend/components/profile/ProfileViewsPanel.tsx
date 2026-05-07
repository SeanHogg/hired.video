import type { ProfileStats } from "@/lib/services/dashboard-service";

interface ProfileViewsPanelProps {
  stats?: ProfileStats | null;
  /** Tighter sizing for sidebar use; default `false` matches the dashboard
   *  card's roomier layout. */
  compact?: boolean;
  /** How many viewers to show in the Recent Viewers strip. */
  maxViewers?: number;
}

/**
 * Profile Views grid (Total / This week / This month / Change) + Recent
 * Viewers list. Single source of truth for both the dashboard's
 * ProfileStatistics card and the profile sidebar's ProfileInsights card.
 */
export function ProfileViewsPanel({
  stats,
  compact = false,
  maxViewers = 5,
}: ProfileViewsPanelProps) {
  const change = stats?.viewsChangePercentage ?? 0;
  const changeClass =
    change > 0
      ? "text-green-600"
      : change < 0
        ? "text-red-600"
        : "text-muted-foreground";

  const cellPad = compact ? "p-2" : "p-2 sm:p-3";
  const numClass = compact
    ? "text-base font-bold"
    : "text-lg sm:text-2xl font-bold";
  const labelClass = compact
    ? "text-[11px] text-muted-foreground"
    : "text-xs text-muted-foreground";
  const gridGap = compact ? "gap-2" : "gap-2 sm:gap-4";
  const viewerSize = compact ? "text-sm" : "text-sm";

  return (
    <>
      <div className={`grid grid-cols-2 ${gridGap} mb-4`}>
        <div className={`text-center ${cellPad} bg-muted/30 rounded-lg`}>
          <div className={`${numClass} text-primary`}>{stats?.totalViews ?? 0}</div>
          <div className={labelClass}>Total</div>
        </div>
        <div className={`text-center ${cellPad} bg-muted/30 rounded-lg`}>
          <div className={`${numClass} text-blue-600`}>{stats?.viewsThisWeek ?? 0}</div>
          <div className={labelClass}>This week</div>
        </div>
        <div className={`text-center ${cellPad} bg-muted/30 rounded-lg`}>
          <div className={`${numClass} text-green-600`}>{stats?.viewsThisMonth ?? 0}</div>
          <div className={labelClass}>This month</div>
        </div>
        <div className={`text-center ${cellPad} bg-muted/30 rounded-lg`}>
          <div className={`${numClass} ${changeClass}`}>
            {change > 0 ? "+" : ""}
            {change}%
          </div>
          <div className={labelClass}>Change</div>
        </div>
      </div>

      {stats?.recentViewers && stats.recentViewers.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">
            Recent Viewers
          </h4>
          {stats.recentViewers.slice(0, maxViewers).map((viewer, index) => (
            <div
              key={viewer.userId || `${index}-${viewer.viewedAt}`}
              className={`flex items-center justify-between p-2 bg-muted/20 rounded ${viewerSize}`}
            >
              <div className="min-w-0">
                <div className="font-medium truncate">{viewer.name}</div>
                {viewer.company && (
                  <div className="text-xs text-muted-foreground truncate">
                    {viewer.company}
                  </div>
                )}
              </div>
              <div className="text-xs text-muted-foreground shrink-0 ml-2">
                {new Date(viewer.viewedAt).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export default ProfileViewsPanel;
