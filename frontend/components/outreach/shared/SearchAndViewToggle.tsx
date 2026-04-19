/**
 * SearchAndViewToggle — the search input + grid/list toggle combo that
 * Templates, Campaigns, and Contacts all share. Callers own the state;
 * this is pure presentation.
 */
import { Grid, List, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type ViewMode = "grid" | "list";

export interface SearchAndViewToggleProps {
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}

export function SearchAndViewToggle({
  placeholder,
  value,
  onChange,
  viewMode,
  onViewModeChange,
}: SearchAndViewToggleProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
        <Input
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="pl-10 min-h-[44px]"
        />
      </div>
      <div className="flex items-center border rounded-md">
        <Button
          variant={viewMode === "grid" ? "default" : "ghost"}
          size="sm"
          onClick={() => onViewModeChange("grid")}
          className="rounded-r-none"
          aria-label="Grid view"
          aria-pressed={viewMode === "grid"}
        >
          <Grid className="h-4 w-4" />
        </Button>
        <Button
          variant={viewMode === "list" ? "default" : "ghost"}
          size="sm"
          onClick={() => onViewModeChange("list")}
          className="rounded-l-none"
          aria-label="List view"
          aria-pressed={viewMode === "list"}
        >
          <List className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export default SearchAndViewToggle;
