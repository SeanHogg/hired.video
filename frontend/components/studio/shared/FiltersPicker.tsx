/**
 * FiltersPicker — colour-grading sliders shared by v1 + v2.
 * Reads + emits the `VideoFilters` shape from `lib/studio/video-filters.ts`
 * (single source of truth). Renders one slider per FilterDef so adding
 * a filter is one entry in the catalog and the UI picks it up.
 */
import { useTranslation } from "react-i18next";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_FILTERS,
  FILTER_DEFS,
  isIdentityFilters,
  type VideoFilters,
} from "@/lib/studio/video-filters";
import { cn } from "@/lib/utils";

export interface FiltersPickerProps {
  filters: VideoFilters | null;
  onChange: (next: VideoFilters) => void;
  className?: string;
}

export default function FiltersPicker({
  filters,
  onChange,
  className,
}: FiltersPickerProps) {
  const { t } = useTranslation();
  const current = filters ?? DEFAULT_FILTERS;
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {FILTER_DEFS.map((def) => (
        <div key={def.id}>
          <div className="mb-1 flex items-center justify-between">
            <Label className="text-xs">{t(def.labelKey)}</Label>
            <span className="font-mono text-[10px] text-muted-foreground">
              {Number(current[def.id]).toFixed(2)}
            </span>
          </div>
          <Slider
            min={def.min}
            max={def.max}
            step={def.step}
            value={[current[def.id]]}
            onValueChange={([v]) =>
              onChange({ ...current, [def.id]: v })
            }
          />
        </div>
      ))}
      <Button
        size="sm"
        variant="ghost"
        className="h-7 self-start text-[10px]"
        disabled={isIdentityFilters(current)}
        onClick={() => onChange(DEFAULT_FILTERS)}
      >
        {t("studio.picker.resetFilters")}
      </Button>
    </div>
  );
}
