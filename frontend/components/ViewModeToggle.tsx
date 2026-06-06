import {
  GalleryHorizontal,
  Grid,
  List,
  Table as TableIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Layout modes a browse surface can offer. `grid` + `list` are the legacy
 * pair (every existing consumer); `scroll` (a horizontal carousel) and
 * `table` (a dense rows-and-columns view) were added for the Studio landing
 * and are opt-in per surface via the `modes` prop. Widening the union is
 * back-compat: a consumer that only handles "grid" | "list" keeps working.
 */
export type ViewMode = "scroll" | "grid" | "table" | "list";

/** Per-mode icon + a11y label — one record so the button row stays uniform
 *  and adding a mode is a single entry. */
const MODE_META: Record<ViewMode, { Icon: typeof Grid; label: string }> = {
  scroll: { Icon: GalleryHorizontal, label: "Scroll view" },
  grid: { Icon: Grid, label: "Grid view" },
  table: { Icon: TableIcon, label: "Table view" },
  list: { Icon: List, label: "List view" },
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
  if (hidden || modes.length < 2) return null;
  return (
    <div className={cn("flex items-center rounded-md border", className)}>
      {modes.map((mode, i) => {
        const { Icon, label } = MODE_META[mode];
        return (
          <Button
            key={mode}
            variant={value === mode ? "default" : "ghost"}
            size="sm"
            onClick={() => onChange(mode)}
            className={cn(
              i === 0 && "rounded-r-none",
              i === modes.length - 1 && "rounded-l-none",
              i > 0 && i < modes.length - 1 && "rounded-none",
            )}
            aria-label={label}
            aria-pressed={value === mode}
          >
            <Icon className="h-4 w-4" />
          </Button>
        );
      })}
    </div>
  );
}
