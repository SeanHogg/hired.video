/**
 * EmptyState — canonical "no data yet" block. Every list surface on the
 * Outreach page uses the same pattern (icon + title + sub + optional CTA),
 * so centralising it keeps the page's empty states visually consistent.
 */
import { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  /** Icon tone. "muted" for plain empty-state, "faded" for larger-illustration
   *  emptiness (e.g. the Advertise sponsored-listings block). */
  iconTone?: "muted" | "faded";
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  iconTone = "muted",
}: EmptyStateProps) {
  return (
    <div className={cn("text-center py-12 px-4", className)}>
      <Icon
        className={cn(
          "h-12 w-12 mx-auto mb-4",
          iconTone === "faded"
            ? "text-muted-foreground/30"
            : "text-muted-foreground",
        )}
      />
      <h3 className="text-lg font-medium mb-2">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
          {description}
        </p>
      )}
      {action}
    </div>
  );
}

export default EmptyState;
