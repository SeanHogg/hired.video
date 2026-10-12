/**
 * Rating stars — generic UI primitive. No domain coupling.
 *
 *  - Read mode: pass `value` (or `null` to render an empty row), shows
 *    filled stars up to the rounded value.
 *  - Pick mode: pass `onChange` to make stars clickable; an extra
 *    "clear" button appears when a value is set so the user can
 *    un-pick an optional rating.
 *
 * Used anywhere user-generated content needs a 1..5 rating —
 * marketplace items, comments, voice clones, services, etc.
 */

import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export interface RatingStarsProps {
  value: number | null;
  onChange?: (value: number | null) => void;
  size?: "sm" | "md" | "lg";
  className?: string;
  ariaLabel?: string;
}

const SIZE_CLASS: Record<NonNullable<RatingStarsProps["size"]>, string> = {
  sm: "h-3.5 w-3.5",
  md: "h-5 w-5",
  lg: "h-6 w-6",
};

export function RatingStars({
  value,
  onChange,
  size = "md",
  className,
  ariaLabel,
}: RatingStarsProps) {
  const interactive = !!onChange;
  const rounded = value === null ? 0 : Math.round(value);

  return (
    <div className={cn("inline-flex items-center gap-0.5", className)} aria-label={ariaLabel}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= rounded;
        const sizeClass = SIZE_CLASS[size];
        if (!interactive) {
          return (
            <Star
              key={n}
              className={cn(
                sizeClass,
                filled ? "text-yellow-500 fill-yellow-500" : "text-gray-300",
              )}
            />
          );
        }
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange?.(n)}
            aria-label={`${n} of 5`}
            className="rounded p-0.5 transition hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Star
              className={cn(
                sizeClass,
                filled ? "text-yellow-500 fill-yellow-500" : "text-gray-300",
              )}
            />
          </button>
        );
      })}
      {interactive && value !== null && (
        <button
          type="button"
          onClick={() => onChange?.(null)}
          className="ml-2 text-xs text-muted-foreground hover:text-foreground"
        >
          Clear
        </button>
      )}
    </div>
  );
}
