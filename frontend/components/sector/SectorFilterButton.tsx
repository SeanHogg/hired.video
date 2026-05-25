/**
 * <SectorFilterButton /> — compact action-bar entry to the shared
 * SectorFilter, mirroring the LocationFilterButton pattern.
 *
 * Used by PageHeader.actions on Jobs / Articles / People (and any future
 * search surface) so each page exposes the same sector filter
 * affordance without redeclaring the popover + filter pair.
 */

import { Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SectorFilter } from "@/components/sector/SectorFilter";
import { sectorMeta, type Sector } from "@shared/sectors";

interface SectorFilterButtonProps {
  value: Sector | null;
  onChange: (next: Sector | null) => void;
  /** `recruitable` (default) — hides content-only sectors like
   *  politics_civic. `all` — for article-search surfaces. */
  mode?: "all" | "recruitable";
}

export default function SectorFilterButton({
  value,
  onChange,
  mode = "recruitable",
}: SectorFilterButtonProps) {
  const active = value !== null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={active ? "default" : "outline"}
          size="sm"
          className="gap-2 min-h-[44px]"
          aria-label="Sector filter"
        >
          <Layers className="h-4 w-4" />
          {active ? sectorMeta(value).label : "Sector"}
          {active && (
            <span className="ml-1 inline-block h-2 w-2 rounded-full bg-primary-foreground" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="space-y-3">
          <h4 className="text-sm font-semibold">Sector</h4>
          <SectorFilter value={value} onChange={onChange} mode={mode} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
