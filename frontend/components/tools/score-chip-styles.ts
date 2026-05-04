/**
 * Score-chip color tokens — shared between SentimentBadge and the
 * generic ScoreChip used for ATS/keyword/format/etc. badges. Keeps the
 * visual vocabulary uniform: the same number scored on a resume looks
 * the same wherever it's rendered.
 *
 * Thresholds mirror `sentimentService.interpretSentiment` so a "Positive"
 * sentiment of 75 and an ATS score of 75 both render in the same green.
 */

import { sentimentService } from "@/lib/services/sentiment-service";

export type ScoreChipSize = "sm" | "md";

export interface ScoreChipStyle {
  /** Border + background + text color classes (Tailwind). */
  colorClass: string;
  sizeClass: string;
  iconSize: string;
  /** Polarity label — used for `aria-label` and `title` text. */
  polarity: "Negative" | "Neutral" | "Positive";
}

export function scoreChipStyle(
  score: number,
  size: ScoreChipSize,
): ScoreChipStyle {
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

  return {
    colorClass,
    sizeClass,
    iconSize,
    polarity: interpretation.label,
  };
}
