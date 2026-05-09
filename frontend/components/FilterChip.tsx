// Single-line filter chip — used by every horizontal filter row across
// the app (currently /tools category row + /tools/vendor-sync vendor
// category row). Active = filled button, idle = outline so the row
// reads as a control rather than navigation. Optional count renders
// after the label.

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  /** Optional count rendered after the label. Omit when the chip
   *  represents a binary filter (no associated count). */
  count?: number;
  active: boolean;
  onClick: () => void;
  className?: string;
}

export function FilterChip({ label, count, active, onClick, className }: Props) {
  return (
    <Button
      variant={active ? "default" : "outline"}
      size="sm"
      className={cn("rounded-full whitespace-nowrap shrink-0", className)}
      onClick={onClick}
    >
      {label}
      {typeof count === "number" && (
        <span className="ml-1.5 text-xs opacity-70">{count}</span>
      )}
    </Button>
  );
}
