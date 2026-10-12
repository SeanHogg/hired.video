// Single-line filter chip — used by every horizontal filter row across
// the app (currently /tools category row + /tools/vendor-sync vendor
// category row). Thin adapter over the design-system PillChip so every
// filter row shares one chip: active = filled foreground, idle = card
// outline, 44px tap target. Optional count renders after the label.

import { PillChip } from "@/components/content/ChipFilterRow";
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
    <PillChip active={active} onClick={onClick} count={count} className={cn("shrink-0", className)}>
      {label}
    </PillChip>
  );
}
