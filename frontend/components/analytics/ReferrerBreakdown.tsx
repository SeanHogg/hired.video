/**
 * ReferrerBreakdown — bar chart of traffic sources keyed on
 * document.referrer captured at view time. Shared across artifacts
 * so the "Traffic Sources" section reads identically on a video, a
 * resume, an article — anywhere a viewer arrived from a link.
 */

import type { ArtifactReferrer } from "./types";

interface Props {
  referrers: ArtifactReferrer[];
  totalViews: number;
  loading?: boolean;
}

export default function ReferrerBreakdown({ referrers, totalViews, loading }: Props) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-4 w-28 bg-muted rounded animate-pulse" />
            <div className="flex-1 h-3 bg-muted rounded animate-pulse" />
            <div className="h-4 w-8 bg-muted rounded animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  if (referrers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">
        No traffic source data available yet.
      </p>
    );
  }

  const denom = totalViews > 0 ? totalViews : 1;

  return (
    <div className="space-y-3">
      {referrers.map(({ source, views }) => {
        const pct = Math.round((views / denom) * 100);
        return (
          <div key={source} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium truncate max-w-[60%]">{source}</span>
              <span className="text-muted-foreground tabular-nums">
                {views} view{views !== 1 ? "s" : ""} ({pct}%)
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary/70 transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
