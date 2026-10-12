/**
 * ViewerList — table of identified + anonymous viewers. The "Avg %"
 * column self-hides when no row exposes a percentage (e.g. job posts,
 * which have no engagement curve), so the same component covers both
 * time-based and static artifacts.
 */

import { Building } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { ArtifactViewer } from "@/lib/analytics/artifact-metrics";

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

interface Props {
  viewers: ArtifactViewer[];
  loading?: boolean;
}

export default function ViewerList({ viewers, loading }: Props) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <div className="h-4 w-32 bg-muted rounded animate-pulse" />
            <div className="h-4 w-24 bg-muted rounded animate-pulse" />
            <div className="h-4 w-12 bg-muted rounded animate-pulse" />
            <div className="h-4 w-16 bg-muted rounded animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  if (viewers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">
        No viewer data available yet.
      </p>
    );
  }

  // Only show the Avg % column when at least one row populates it —
  // static artifacts (no time/scroll engagement) omit the field
  // entirely rather than synthesising a meaningless 0%.
  const showAvgPct = viewers.some((v) => typeof v.avgPercent === "number");

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="pb-2 pr-4 font-medium">Email</th>
            <th className="pb-2 pr-4 font-medium">Company</th>
            <th className="pb-2 pr-4 font-medium text-right">Views</th>
            {showAvgPct && (
              <th className="pb-2 pr-4 font-medium text-right">Avg %</th>
            )}
            <th className="pb-2 font-medium text-right">Last Viewed</th>
          </tr>
        </thead>
        <tbody>
          {viewers.map((viewer) => (
            <tr
              key={viewer.id}
              className="border-b last:border-0 hover:bg-muted/50 transition-colors"
            >
              <td className="py-2.5 pr-4">
                {viewer.email ? (
                  <span className="font-medium">{viewer.email}</span>
                ) : (
                  <span className="text-muted-foreground italic">Anonymous</span>
                )}
              </td>
              <td className="py-2.5 pr-4">
                {viewer.company ? (
                  <span className="inline-flex items-center gap-1">
                    <Building className="h-3 w-3 text-muted-foreground" />
                    {viewer.company}
                  </span>
                ) : (
                  <span className="text-muted-foreground">--</span>
                )}
              </td>
              <td className="py-2.5 pr-4 text-right tabular-nums">{viewer.views}</td>
              {showAvgPct && (
                <td className="py-2.5 pr-4 text-right">
                  {typeof viewer.avgPercent === "number" ? (
                    <Badge
                      variant={
                        viewer.avgPercent >= 75
                          ? "default"
                          : viewer.avgPercent >= 40
                            ? "secondary"
                            : "outline"
                      }
                      className="text-xs"
                    >
                      {Math.round(viewer.avgPercent)}%
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">--</span>
                  )}
                </td>
              )}
              <td className="py-2.5 text-right text-muted-foreground text-xs">
                {formatDate(viewer.lastViewed)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
