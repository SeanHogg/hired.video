// Empty state for app (signed-in) surfaces: icon tile, short title, muted
// line, and at most ONE primary action. Use inside a list/card area when
// there is nothing to show yet.

import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface AppEmptyStateProps {
  icon?: ComponentType<{ className?: string }>;
  title: ReactNode;
  description?: ReactNode;
  /** The single primary action (a Button / Link). */
  action?: ReactNode;
  /** Heading level — `h1` when the empty state IS the page (not found). */
  as?: "h1" | "h2" | "h3";
  className?: string;
}

export function AppEmptyState({ icon: Icon, title, description, action, as: Heading = "h3", className }: AppEmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-[20px] border border-dashed border-border bg-card px-6 py-12 text-center",
        className,
      )}
    >
      {Icon && (
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-primary">
          <Icon className="h-6 w-6" aria-hidden="true" />
        </span>
      )}
      <Heading className="font-display text-xl font-bold tracking-[-0.02em] text-foreground">{title}</Heading>
      {description && <p className="max-w-md text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export default AppEmptyState;
