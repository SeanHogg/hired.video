/**
 * tab-item.tsx — presentational primitive shared by `PageHeader` (route-
 * driven via `<Link>`) and `TabStrip` (state-driven via `onChange`).
 *
 * Visual lives in ONE place (#678). Future tweaks to active colour /
 * underline weight / badge offset land here and both surfaces inherit.
 */

import type { ComponentType, ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function tabItemClass(active: boolean): string {
  return cn(
    "inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors",
    active
      ? "border-primary text-foreground"
      : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted",
  );
}

interface TabItemContentProps {
  label: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  badge?: ReactNode;
}

export function TabItemContent({ label, icon: Icon, badge }: TabItemContentProps) {
  return (
    <>
      {Icon && <Icon className="w-4 h-4" />}
      {label}
      {badge !== undefined && badge !== null && badge !== false && (
        <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs font-normal">
          {badge}
        </Badge>
      )}
    </>
  );
}
