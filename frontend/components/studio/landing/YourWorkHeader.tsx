import { useTranslation } from "react-i18next";
import ViewModeToggle, { BROWSE_VIEW_MODES } from "@/components/ViewModeToggle";
import WorkspaceSwitcher from "@/components/studio/WorkspaceSwitcher";
import type { ViewMode } from "@/lib/hooks/useViewMode";
import { WORK_FILTERS, type WorkFilter } from "@/lib/studio/landing/work-items";
import { ACTION_BAR_SURFACE } from "@/lib/ui/action-bar";
import { cn } from "@/lib/utils";

/**
 * "Your work" header — title, the All / Kits / Other / Posted / Drafts
 * filter, the Scroll / Grid / Table toggle and the workspace switcher (it
 * self-gates: null for single-workspace users).
 */
export default function YourWorkHeader({
  filter,
  onFilterChange,
  viewMode,
  onViewModeChange,
}: {
  filter: WorkFilter;
  onFilterChange: (next: WorkFilter) => void;
  viewMode: ViewMode;
  onViewModeChange: (next: ViewMode) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className={ACTION_BAR_SURFACE}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col">
          <h2 id="your-work" className="font-display text-xl font-bold tracking-[-0.02em]">
            {t("studio.landing.work.title")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("studio.landing.work.sub")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div
            role="group"
            aria-label={t("studio.landing.work.filterAria")}
            className="inline-flex max-w-full flex-wrap rounded-[10px] border border-input bg-card p-0.5"
          >
            {WORK_FILTERS.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => onFilterChange(value)}
                className={cn(
                  "min-h-9 rounded-[8px] px-3 text-[13px] font-semibold",
                  filter === value ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(`studio.landing.work.filter.${value}`)}
              </button>
            ))}
          </div>
          <ViewModeToggle value={viewMode} onChange={onViewModeChange} modes={BROWSE_VIEW_MODES} />
          <WorkspaceSwitcher />
        </div>
      </div>
    </div>
  );
}
