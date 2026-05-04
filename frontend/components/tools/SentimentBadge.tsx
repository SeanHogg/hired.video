import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  scoreChipStyle,
  type ScoreChipSize,
} from "./score-chip-styles";

interface SentimentBadgeProps {
  /** 0–100 sentiment score, or null/undefined if the tool has not been run. */
  score: number | null | undefined;
  size?: ScoreChipSize;
  className?: string;
}

/**
 * Inline sentiment chip — heart icon + numeric score, colored by
 * polarity. Returns null when the score has not been computed yet, so
 * consumers can drop it anywhere without gating on `?.` themselves
 * (DRY rule: shared components decide their own visibility).
 *
 * Color/size logic comes from `scoreChipStyle` — shared with the
 * generic `ScoreChip` used for ATS/keyword/etc. badges.
 */
export default function SentimentBadge({
  score,
  size = "sm",
  className,
}: SentimentBadgeProps) {
  if (score == null) return null;

  const style = scoreChipStyle(score, size);
  const isPositive = style.polarity === "Positive";

  return (
    <span
      title={`${style.polarity} sentiment (${Math.round(score)}/100)`}
      aria-label={`Sentiment ${Math.round(score)} out of 100`}
      className={cn(
        "inline-flex items-center rounded-full border font-medium",
        style.sizeClass,
        style.colorClass,
        className,
      )}
    >
      <Heart className={cn(style.iconSize, isPositive ? "fill-current" : "")} />
      {Math.round(score)}
    </span>
  );
}
