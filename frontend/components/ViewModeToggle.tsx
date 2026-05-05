import { Grid, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ViewMode = "grid" | "list";

export interface ViewModeToggleProps {
  value: ViewMode;
  onChange: (next: ViewMode) => void;
  className?: string;
  /** Hide the toggle entirely (some surfaces only support one layout). */
  hidden?: boolean;
}

/**
 * Two-button grid/list segmented control. Used by every browse surface
 * (Resumes, Jobs, People, Companies, …) so the active state, sizing, and
 * accessibility labels stay consistent.
 *
 * Returns `null` when `hidden` is set so callers can drop it into a
 * PageHeader `actions` slot without an extra ternary.
 */
export default function ViewModeToggle({
  value,
  onChange,
  className,
  hidden,
}: ViewModeToggleProps): JSX.Element | null {
  if (hidden) return null;
  return (
    <div className={cn("flex items-center border rounded-md", className)}>
      <Button
        variant={value === "grid" ? "default" : "ghost"}
        size="sm"
        onClick={() => onChange("grid")}
        className="rounded-r-none"
        aria-label="Grid view"
        aria-pressed={value === "grid"}
      >
        <Grid className="h-4 w-4" />
      </Button>
      <Button
        variant={value === "list" ? "default" : "ghost"}
        size="sm"
        onClick={() => onChange("list")}
        className="rounded-l-none"
        aria-label="List view"
        aria-pressed={value === "list"}
      >
        <List className="h-4 w-4" />
      </Button>
    </div>
  );
}
