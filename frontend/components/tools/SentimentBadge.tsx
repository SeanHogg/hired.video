import { Heart } from "lucide-react";
import { sentimentService } from "@/lib/services/sentiment-service";
import { cn } from "@/lib/utils";

interface SentimentBadgeProps {
  /** 0–100 sentiment score, or null/undefined if the tool has not been run. */
  score: number | null | undefined;
  size?: "sm" | "md";
  className?: string;
}

/**
 * Inline sentiment chip — heart icon + numeric score, colored by polarity.
 * Returns null when the score has not been computed yet, so consumers can
 * drop it anywhere without gating on `?.` themselves (DRY rule: shared
 * components decide their own visibility).
 *
 * Color/polarity logic delegates to `sentimentService.interpretSentiment`
 * — the canonical mapping. Don't reimplement the thresholds here.
 */
export default function SentimentBadge({
  score,
  size = "sm",
  className,
}: SentimentBadgeProps) {
  if (score == null) return null;

  const interpretation = sentimentService.interpretSentiment(score);
  const colorClass =
    interpretation.color === "red"
      ? "text-red-600 bg-red-50 border-red-200"
      : interpretation.color === "yellow"
        ? "text-yellow-700 bg-yellow-50 border-yellow-200"
        : "text-green-700 bg-green-50 border-green-200";

  const sizeClass =
    size === "sm" ? "text-xs px-1.5 py-0.5 gap-1" : "text-sm px-2 py-1 gap-1.5";
  const iconSize = size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5";

  return (
    <span
      title={`${interpretation.label} sentiment (${Math.round(score)}/100)`}
      aria-label={`Sentiment ${Math.round(score)} out of 100`}
      className={cn(
        "inline-flex items-center rounded-full border font-medium",
        sizeClass,
        colorClass,
        className,
      )}
    >
      <Heart
        className={cn(
          iconSize,
          interpretation.color === "green" ? "fill-current" : "",
        )}
      />
      {Math.round(score)}
    </span>
  );
}
