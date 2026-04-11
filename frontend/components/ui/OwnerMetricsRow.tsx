import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface OwnerMetricsRowProps {
  /** When false, the entire metrics row is hidden — no counts, no row. */
  isOwner: boolean;
  className?: string;
  children: React.ReactNode;
}

/**
 * Container for owner-only metrics (views, applications, profile views, etc).
 *
 * Per product policy, aggregate engagement metrics on a content item are
 * private to the owner of that item. Non-owners must not see these counts
 * at all — the whole row is removed from the DOM rather than just blanked,
 * so there's no leak through devtools or screen readers either.
 */
export function OwnerMetricsRow({ isOwner, className, children }: OwnerMetricsRowProps) {
  if (!isOwner) return null;
  return (
    <div
      className={cn(
        "flex items-center gap-4 text-xs text-muted-foreground",
        className,
      )}
    >
      {children}
    </div>
  );
}

interface MetricProps {
  icon: LucideIcon;
  value: number | string;
  label: string;
}

/**
 * Single metric atom: `<icon> <value> <label>`. Intended for use inside
 * `<OwnerMetricsRow>` so consumers can keep their visual order but inherit
 * the owner-gating and row styling for free.
 */
export function Metric({ icon: Icon, value, label }: MetricProps) {
  return (
    <div className="flex items-center gap-1">
      <Icon className="h-3 w-3" />
      <span>
        {value} {label}
      </span>
    </div>
  );
}

export default OwnerMetricsRow;
