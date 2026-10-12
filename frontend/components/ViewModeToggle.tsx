import {
  GalleryHorizontal,
  Grid,
  List,
  Table as TableIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { ViewMode } from "@/lib/hooks/useViewMode";

/**
 * The canonical Scroll / Grid / Table trio every browse surface offers
 * (Studio landing, Resumes, Jobs, People, Companies, Tools, Search,
 * Services). Shared so the toggle, ordering, and persisted-mode validation
 * stay identical across pages — pass it to both `<ViewModeToggle modes>`
 * and `useViewMode(..., modes)`.
 */
export const BROWSE_VIEW_MODES: ViewMode[] = ["scroll", "grid", "table"];

/** Per-mode icon + a11y label — one record so the button row stays uniform
 *  and adding a mode is a single entry. */
const MODE_META: Record<ViewMode, { Icon: typeof Grid; labelKey: string }> = {
  scroll: { Icon: GalleryHorizontal, labelKey: "viewMode.scroll" },
  grid: { Icon: Grid, labelKey: "actions.gridView" },
  table: { Icon: TableIcon, labelKey: "viewMode.table" },
  list: { Icon: List, labelKey: "actions.listView" },
};

export interface ViewModeToggleProps {
  value: ViewMode;
  onChange: (next: ViewMode) => void;
  /** Which modes to offer, in display order. Defaults to the legacy
   *  grid/list pair so existing callers are unaffected. */
  modes?: ViewMode[];
  className?: string;
  /** Hide the toggle entirely (some surfaces only support one layout). */
  hidden?: boolean;
}

/**
 * Segmented layout-mode control. Used by every browse surface (Resumes,
 * Jobs, People, Companies, Studio landing, …) so the active state, sizing,
 * and accessibility labels stay consistent. Pair with `useViewMode` to
 * persist the choice to localStorage.
 *
 * Returns `null` when `hidden` is set so callers can drop it into a
 * PageHeader `actions` slot without an extra ternary.
 */
export default function ViewModeToggle({
  value,
  onChange,
  modes = ["grid", "list"],
  className,
  hidden,
}: ViewModeToggleProps): JSX.Element | null {
  const { t } = useTranslation();
  if (hidden || modes.length < 2) return null;
  return (
    <div
      role="group"
      aria-label={t("viewMode.aria")}
      className={cn("inline-flex items-center gap-0.5 rounded-xl border border-input bg-card p-0.5", className)}
    >
      {modes.map((mode) => {
        const { Icon, labelKey } = MODE_META[mode];
        const active = value === mode;
        const label = t(labelKey);
        return (
          <button
            key={mode}
            type="button"
            onClick={() => onChange(mode)}
            title={label}
            aria-label={label}
            aria-pressed={active}
            className={cn(
              "inline-flex h-10 w-10 items-center justify-center rounded-[9px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
