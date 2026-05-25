/**
 * <SectorFilter /> — URL-bound sector filter for search pages, same
 * pattern as LocationFilter.
 *
 * Reads/writes the `sector` query param. Pages pass the current value
 * into the API service call so the unified search endpoint can filter
 * server-side via the partial sector index from migration 0112.
 *
 * Per the DRY rule: every search page imports this — never inline a
 * sector dropdown into a Filters drawer.
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  type Sector,
  allSectors,
  recruitableSectors,
  isValidSector,
} from "@shared/sectors";

export interface SectorFilterProps {
  value: Sector | null;
  onChange: (next: Sector | null) => void;
  /** `recruitable` (default) hides content-only sectors like
   *  politics_civic. `all` matches article-search surfaces. */
  mode?: "all" | "recruitable";
  /** Compact horizontal layout for header filter bars. */
  compact?: boolean;
}

export function SectorFilter({
  value,
  onChange,
  mode = "recruitable",
  compact = false,
}: SectorFilterProps) {
  const options = mode === "all" ? allSectors() : recruitableSectors();

  return (
    <div className={compact ? "flex flex-wrap items-center gap-2" : "space-y-2"}>
      {!compact && (
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Sector</span>
          {value !== null && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => onChange(null)}
            >
              Clear
            </Button>
          )}
        </div>
      )}
      <div className={compact ? "flex flex-wrap gap-1.5" : "flex flex-wrap gap-2"}>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="focus:outline-none focus:ring-2 focus:ring-ring rounded-md"
        >
          <Badge
            variant={value === null ? "default" : "outline"}
            className="cursor-pointer text-xs px-2.5 py-1"
          >
            All sectors
          </Badge>
        </button>
        {options.map((m) => {
          const selected = value === m.slug;
          return (
            <button
              key={m.slug}
              type="button"
              onClick={() => onChange(selected ? null : m.slug)}
              className="focus:outline-none focus:ring-2 focus:ring-ring rounded-md"
              aria-pressed={selected}
              title={m.tagline}
            >
              <Badge
                variant={selected ? "default" : "outline"}
                className="cursor-pointer text-xs px-2.5 py-1"
              >
                {m.label}
              </Badge>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Helpers for URL <-> filter state, matching the locationFilterFromQuery /
 * applyLocationFilterToQuery API.
 */
export function sectorFilterFromQuery(params: URLSearchParams): Sector | null {
  const raw = params.get("sector");
  if (!raw) return null;
  return isValidSector(raw) ? raw : null;
}

export function applySectorFilterToQuery(
  params: URLSearchParams,
  value: Sector | null,
): URLSearchParams {
  const next = new URLSearchParams(params);
  if (value === null) {
    next.delete("sector");
  } else {
    next.set("sector", value);
  }
  return next;
}
