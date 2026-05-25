/**
 * <SectorPicker /> + <SectorMultiPicker /> — single-source-of-truth sector
 * selection for every form that needs a vertical dimension (job post,
 * article authoring, affiliate specialization, resume template metadata).
 *
 * Per the DRY rule: every form imports from here — never re-roll a sector
 * dropdown locally. The enum + metadata live in `shared/sectors.ts`.
 *
 * SectorPicker — single-value (jobs, articles).
 * SectorMultiPicker — multi-value (resume template `sectors[]`, affiliate
 * `specialtySectors[]`). Self-gates: hides itself when `mode` excludes
 * `contentOnly` sectors and only those would render.
 */

import { useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type Sector,
  allSectors,
  recruitableSectors,
  sectorMeta,
  isValidSector,
} from "@shared/sectors";

export type SectorPickerMode = "all" | "recruitable";

function sectorOptionsFor(mode: SectorPickerMode) {
  return mode === "all" ? allSectors() : recruitableSectors();
}

export interface SectorPickerProps {
  value: Sector | null;
  onChange: (next: Sector | null) => void;
  /**
   * `recruitable` (default) hides `politics_civic` since you can't post a
   * job / be hired into an elected office. `all` includes every sector,
   * used by article authoring + landing page filters.
   */
  mode?: SectorPickerMode;
  /** Label for the empty/clear option ("Any sector" vs "No sector"). */
  emptyLabel?: string;
  /** Force a sector pick — hides the clear option. */
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

export function SectorPicker({
  value,
  onChange,
  mode = "recruitable",
  emptyLabel = "Any sector",
  required = false,
  disabled = false,
  className,
}: SectorPickerProps) {
  const options = sectorOptionsFor(mode);

  const handleChange = useCallback(
    (next: string) => {
      if (next === "__clear__") {
        onChange(null);
        return;
      }
      if (isValidSector(next)) onChange(next);
    },
    [onChange],
  );

  return (
    <Select
      value={value ?? "__clear__"}
      onValueChange={handleChange}
      disabled={disabled}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder={emptyLabel} />
      </SelectTrigger>
      <SelectContent>
        {!required && <SelectItem value="__clear__">{emptyLabel}</SelectItem>}
        {options.map((m) => (
          <SelectItem key={m.slug} value={m.slug}>
            {m.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export interface SectorMultiPickerProps {
  value: Sector[];
  onChange: (next: Sector[]) => void;
  mode?: SectorPickerMode;
  disabled?: boolean;
  className?: string;
  /**
   * Maximum number of sectors a single entity can claim. Affiliates can
   * realistically specialize in 2-3; resume templates in 3-5. Default 5.
   */
  max?: number;
}

export function SectorMultiPicker({
  value,
  onChange,
  mode = "recruitable",
  disabled = false,
  className,
  max = 5,
}: SectorMultiPickerProps) {
  const options = sectorOptionsFor(mode);

  const toggle = useCallback(
    (slug: Sector) => {
      if (disabled) return;
      const has = value.includes(slug);
      if (has) {
        onChange(value.filter((s) => s !== slug));
        return;
      }
      if (value.length >= max) return;
      onChange([...value, slug]);
    },
    [value, onChange, disabled, max],
  );

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-2">
        {options.map((m) => {
          const selected = value.includes(m.slug);
          return (
            <button
              key={m.slug}
              type="button"
              onClick={() => toggle(m.slug)}
              disabled={disabled || (!selected && value.length >= max)}
              className="focus:outline-none focus:ring-2 focus:ring-ring rounded-md"
              aria-pressed={selected}
            >
              <Badge
                variant={selected ? "default" : "outline"}
                className="cursor-pointer text-xs px-3 py-1"
              >
                {m.label}
              </Badge>
            </button>
          );
        })}
      </div>
      {value.length >= max && (
        <p className="mt-2 text-xs text-muted-foreground">
          Maximum {max} sectors selected. Remove one to add another.
        </p>
      )}
    </div>
  );
}

/**
 * Inline label render for a sector slug — used everywhere we display
 * "Sector: Healthcare" rather than re-deriving the label from the meta.
 * Returns null for unknown slugs so consumers don't render garbage.
 */
export function SectorBadge({ slug }: { slug: string | null | undefined }) {
  if (!slug || !isValidSector(slug)) return null;
  return (
    <Badge variant="secondary" className="text-xs">
      {sectorMeta(slug).label}
    </Badge>
  );
}
