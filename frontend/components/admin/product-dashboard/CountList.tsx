import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";

interface CountListProps {
  counts: Record<string, number> | undefined;
  /** Rendered instead of the list when there are no entries; omit to render an empty list. */
  emptyText?: string;
  formatValue?: (value: number) => ReactNode;
}

/** Label → badge breakdown list (jobs by status, companies by size, …). */
export function CountList({ counts, emptyText, formatValue }: CountListProps) {
  const entries = Object.entries(counts || {});
  if (emptyText !== undefined && entries.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        {emptyText}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {entries.map(([label, count]) => (
        <div key={label} className="flex justify-between items-center">
          <span className="text-sm font-medium">{label}</span>
          <Badge variant="secondary">{formatValue ? formatValue(count) : count}</Badge>
        </div>
      ))}
    </div>
  );
}
