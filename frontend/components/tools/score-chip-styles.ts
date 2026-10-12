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
      ? "text-destructive bg-destructive/10 border-destructive/30"
      : interpretation.color === "yellow"
        ? "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-500/10 dark:border-amber-500/30"
        : "text-brand-green-text bg-brand-green/10 border-brand-green/30";

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
