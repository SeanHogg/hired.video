// Horizontal "All + per-category" chip row used by every list page that
// filters by category (Tools, VendorSync, Blog). Self-contained — owns
// the row container, the "All" sentinel, and the zero-count hiding rule
// so callers only supply the options + selected value.

import { FilterChip } from "@/components/FilterChip";
import { cn } from "@/lib/utils";

export interface CategoryFilterOption<V extends string = string> {
  value: V;
  label: string;
  count: number;
}

interface Props<V extends string> {
  options: CategoryFilterOption<V>[];
  /** Selected value, or "all" sentinel for no filter. */
  value: V | "all";
  onChange: (next: V | "all") => void;
  /** Label for the leading "All" chip. */
  allLabel?: string;
  /** Count shown on the "All" chip. Defaults to the sum of option counts —
   *  override when the underlying total isn't strictly the sum (e.g. items
   *  without a category, or counts already filtered by other criteria). */
  allCount?: number;
  /** Drop chips whose count is zero so the row only shows reachable
   *  destinations. Default true. */
  hideZeroCounts?: boolean;
  className?: string;
}

export function CategoryFilterBar<V extends string>({
  options,
  value,
  onChange,
  allLabel = "All",
  allCount,
  hideZeroCounts = true,
  className,
}: Props<V>) {
  const total = allCount ?? options.reduce((sum, o) => sum + o.count, 0);
  return (
    <div
      className={cn(
        "flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1",
        className,
      )}
    >
      <FilterChip
        label={allLabel}
        count={total}
        active={value === "all"}
        onClick={() => onChange("all")}
      />
      {options.map((opt) => {
        if (hideZeroCounts && opt.count === 0) return null;
        return (
          <FilterChip
            key={opt.value}
            label={opt.label}
            count={opt.count}
            active={value === opt.value}
            onClick={() => onChange(opt.value)}
          />
        );
      })}
    </div>
  );
}
