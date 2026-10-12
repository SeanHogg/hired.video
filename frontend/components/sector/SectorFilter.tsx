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

import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { PillChip } from "@/components/content/ChipFilterRow";
import { localizeSector } from "@/lib/sectors/localize-sector";
import { cn } from "@/lib/utils";
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
  const { t } = useTranslation();
  const options = mode === "all" ? allSectors() : recruitableSectors();

  return (
    <div className={compact ? "flex flex-wrap items-center gap-2" : "flex flex-col gap-2"}>
      {!compact && (
        <div className="flex items-center justify-between">
          <span className="font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
            {t("labels.sector")}
          </span>
          {value !== null && (
            <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
              {t("actions.clear")}
            </Button>
          )}
        </div>
      )}
      <div
        role="group"
        aria-label={t("sectorFilter.aria")}
        className={cn("flex flex-wrap", compact ? "gap-1.5" : "gap-2")}
      >
        <PillChip active={value === null} onClick={() => onChange(null)}>
          {t("sectorFilter.all")}
        </PillChip>
        {options.map((m) => {
          const selected = value === m.slug;
          const { label, tagline } = localizeSector(m, t);
          return (
            <span key={m.slug} title={tagline} className="contents">
              <PillChip active={selected} onClick={() => onChange(selected ? null : m.slug)}>
                {label}
              </PillChip>
            </span>
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
