/**
 * KpiCard — single-metric card used across Dashboard, Advertise, and
 * Performance tabs. Interactive when `onClick` is provided (keyboard +
 * pointer), decorative otherwise.
 */
import { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface KpiCardProps {
  title: string;
  value: ReactNode;
  caption?: ReactNode;
  icon?: LucideIcon;
  onClick?: () => void;
  className?: string;
}

export function KpiCard({
  title,
  value,
  caption,
  icon: Icon,
  onClick,
  className,
}: KpiCardProps) {
  const interactive = Boolean(onClick);
  return (
    <Card
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick!();
              }
            }
          : undefined
      }
      className={cn(
        interactive &&
          "cursor-pointer hover:border-primary/50 hover:shadow-sm transition",
        className,
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {caption !== undefined && (
          <div className="text-xs text-muted-foreground">{caption}</div>
        )}
      </CardContent>
    </Card>
  );
}

export default KpiCard;
