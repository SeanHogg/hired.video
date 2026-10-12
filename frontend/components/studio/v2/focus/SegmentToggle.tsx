/**
 * SegmentToggle — compact two/three-way switch used inside left-panel tabs
 * (AI: Chat | Generate, Widgets: Widgets | Actions).
 */
import { cn } from "@/lib/utils";

export interface SegmentOption<T extends string> {
  id: T;
  label: string;
}

export default function SegmentToggle<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (next: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex gap-1 rounded-[9px] bg-muted p-[3px]">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          role="radio"
          aria-checked={value === opt.id}
          onClick={() => onChange(opt.id)}
          className={cn(
            "min-h-9 flex-1 rounded-[7px] px-2 text-xs font-semibold transition-colors",
            value === opt.id
              ? "bg-card text-foreground shadow-sm"
              : "text-foreground/80 hover:text-foreground",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
