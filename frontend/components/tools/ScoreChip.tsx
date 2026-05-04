import { cn } from "@/lib/utils";
import {
  scoreChipStyle,
  type ScoreChipSize,
} from "./score-chip-styles";

interface ScoreChipProps {
  /** Short uppercase label (e.g. "ATS", "KW"). */
  label: string;
  /** 0–100 score, or null/undefined to suppress the chip entirely. */
  score: number | null | undefined;
  /** Long-form label used for `aria-label` and `title` (e.g. "ATS compatibility"). */
  fullLabel?: string;
  size?: ScoreChipSize;
  className?: string;
}

/**
 * Generic 0–100 score chip — short letter label + numeric score,
 * colored by the same polarity thresholds as SentimentBadge.
 *
 * Returns null when score is null/undefined — caller can drop a row of
 * these inline without gating each one (DRY rule: shared components
 * decide their own visibility).
 */
export default function ScoreChip({
  label,
  score,
  fullLabel,
  size = "sm",
  className,
}: ScoreChipProps) {
  if (score == null) return null;

  const style = scoreChipStyle(score, size);
  const human = fullLabel ?? label;

  return (
    <span
      title={`${human} ${Math.round(score)}/100`}
      aria-label={`${human} ${Math.round(score)} out of 100`}
      className={cn(
        "inline-flex items-center rounded-full border font-medium tabular-nums",
        style.sizeClass,
        style.colorClass,
        className,
      )}
    >
      <span className="font-semibold">{label}</span>
      <span>{Math.round(score)}</span>
    </span>
  );
}
