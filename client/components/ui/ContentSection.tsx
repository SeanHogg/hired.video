import * as React from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ContentSectionProps<T> {
  title: string;
  items: T[];
   
  renderItem: (item: T, index: number) => React.ReactNode;
  isLoading?: boolean;
  error?: string | null;
  gridCols?: string;
  maxItems?: number;
  className?: string;
  titleClassName?: string;
  gridClassName?: string;
  emptyMessage?: string;
  onRetry?: () => void;
  loadingSkeletonCount?: number;
}

/**
 * ContentSection - Reusable section wrapper for card grids
 *
 * Provides:
 * - Consistent section title styling
 * - Responsive grid layouts
 * - Loading states with skeleton placeholders
 * - Error handling with retry functionality
 * - Empty state messaging
 * - Configurable item limits
 */
export function ContentSection<T>({
  title,
  items,
  renderItem,
  isLoading = false,
  error = null,
  gridCols = "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
  maxItems = 4,
  className = "",
  titleClassName = "",
  gridClassName = "",
  emptyMessage = "No items found",
  onRetry,
  loadingSkeletonCount = 4,
}: ContentSectionProps<T>) {
  // Loading state
  if (isLoading) {
    return (
      <div className={cn("space-y-4", className)}>
        <h3 className={cn("text-lg font-semibold", titleClassName)}>{title}</h3>
        <div className={cn("grid gap-4", gridCols, gridClassName)}>
          {Array.from({ length: loadingSkeletonCount }).map((_, index) => (
            <div
              key={index}
              className="h-48 bg-muted animate-pulse rounded-lg border"
            />
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={cn("space-y-4", className)}>
        <h3 className={cn("text-lg font-semibold", titleClassName)}>{title}</h3>
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground mb-4">{error}</p>
          {onRetry && (
            <Button variant="outline" onClick={onRetry} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Try Again
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Empty state
  if (items.length === 0) {
    return (
      <div className={cn("space-y-4", className)}>
        <h3 className={cn("text-lg font-semibold", titleClassName)}>{title}</h3>
        <div className="text-center py-8 text-muted-foreground">
          {emptyMessage}
        </div>
      </div>
    );
  }

  // Content state
  const displayItems = maxItems > 0 ? items.slice(0, maxItems) : items;

  return (
    <div className={cn("space-y-4", className)}>
      <h3 className={cn("text-lg font-semibold", titleClassName)}>{title}</h3>
      <div className={cn("grid gap-4", gridCols, gridClassName)}>
        {displayItems.map((item, index) => renderItem(item, index))}
      </div>
    </div>
  );
}

export default ContentSection;
