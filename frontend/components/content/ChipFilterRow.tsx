// Pill filter chips in the /templates style: idle = card outline, active =
// filled foreground. Used by every content index (blog, articles, help,
// tutorials) so the filter row reads the same everywhere. Owns the "All"
// sentinel and the zero-count hiding rule; callers pass options + value.

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export interface ChipOption<V extends string = string> {
  value: V;
  label: string;
  count?: number;
}

interface PillChipProps {
  active: boolean;
  onClick: () => void;
  count?: number;
  children: ReactNode;
  className?: string;
}

export function PillChip({ active, onClick, count, children, className }: PillChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-[44px] flex-none items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm font-semibold transition-colors",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-input bg-card text-foreground hover:bg-muted",
        className,
      )}
    >
      {children}
      {typeof count === "number" && (
        <span className={cn("font-mono text-xs", active ? "text-background/70" : "text-muted-foreground")}>
          {count}
        </span>
      )}
    </button>
  );
}

interface ChipFilterRowProps<V extends string> {
  options: ChipOption<V>[];
  /** Selected value, or "all". */
  value: V | "all";
  onChange: (next: V | "all") => void;
  ariaLabel: string;
  /** Leading "All" chip label; defaults to the shared "All" string. */
  allLabel?: string;
  allCount?: number;
  /** Hide options whose count is 0 (default true). */
  hideZeroCounts?: boolean;
  /** Omit the leading "All" chip (e.g. single-select without a reset). */
  hideAll?: boolean;
  className?: string;
}

export default function ChipFilterRow<V extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  allLabel,
  allCount,
  hideZeroCounts = true,
  hideAll = false,
  className,
}: ChipFilterRowProps<V>) {
  const { t } = useTranslation();
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn("-mx-6 flex gap-2 overflow-x-auto px-6 pb-1 sm:mx-0 sm:flex-wrap sm:px-0", className)}
    >
      {!hideAll && (
        <PillChip active={value === "all"} onClick={() => onChange("all")} count={allCount}>
          {allLabel ?? t("labels.allShort")}
        </PillChip>
      )}
      {options.map((opt) =>
        hideZeroCounts && opt.count === 0 ? null : (
          <PillChip
            key={opt.value}
            active={value === opt.value}
            onClick={() => onChange(opt.value)}
            count={opt.count}
          >
            {opt.label}
          </PillChip>
        ),
      )}
    </div>
  );
}
