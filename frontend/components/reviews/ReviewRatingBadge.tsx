/**
 * Inline rating + review-count chip. Self-gates: returns null when there
 * are zero reviews so consumers can drop it into a card row without
 * branching on `count > 0`.
 *
 * Used wherever the review aggregate is denormalised on the parent row
 * (e.g. companies.review_count / review_avg_overall). For surfaces that
 * load the full aggregate object, prefer rendering ReviewsSection's
 * header directly.
 */

import { Link } from "react-router-dom";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface ReviewRatingBadgeProps {
  value: number | null | undefined;
  count: number | null | undefined;
  size?: "sm" | "md";
  /** Wrap in a Link to this path. Omit for a non-interactive chip. */
  href?: string;
  className?: string;
}

const TEXT_CLASS = { sm: "text-xs", md: "text-sm" } as const;
const ICON_CLASS = { sm: "h-3 w-3", md: "h-4 w-4" } as const;

export function ReviewRatingBadge({
  value,
  count,
  size = "sm",
  href,
  className,
}: ReviewRatingBadgeProps) {
  if (!count || count <= 0) return null;
  const avg = typeof value === "number" ? value.toFixed(1) : "—";
  const body = (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-muted-foreground",
        TEXT_CLASS[size],
        className,
      )}
      aria-label={`Average ${avg} out of 5 across ${count} review${count === 1 ? "" : "s"}`}
    >
      <Star className={cn(ICON_CLASS[size], "text-yellow-500 fill-yellow-500")} />
      <span className="font-medium text-foreground">{avg}</span>
      <span>({count})</span>
    </span>
  );
  if (!href) return body;
  return (
    <Link to={href} className="hover:underline">
      {body}
    </Link>
  );
}
