import { useTranslation } from "react-i18next";
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
  /** When provided, the chip becomes a button. Surface uses this to deep-link
   *  into the tool that produced the score. Click is stopped from bubbling so
   *  parent card-level navigation (e.g. resume detail link) doesn't fire. */
  onClick?: () => void;
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
  onClick,
}: ScoreChipProps) {
  const { t } = useTranslation();
  if (score == null) return null;

  const style = scoreChipStyle(score, size);
  const human = fullLabel ?? label;
  const rounded = Math.round(score);
  const baseClass = cn(
    "inline-flex items-center rounded-full border font-medium tabular-nums",
    style.sizeClass,
    style.colorClass,
    onClick && "cursor-pointer hover:opacity-80 transition-opacity",
    className,
  );

  if (onClick) {
    return (
      <button
        type="button"
        title={t("scoreChip.titleHistory", { label: human, score: rounded })}
        aria-label={t("scoreChip.ariaHistory", { label: human, score: rounded })}
        className={baseClass}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onClick();
        }}
      >
        <span className="font-semibold">{label}</span>
        <span>{rounded}</span>
      </button>
    );
  }

  return (
    <span
      title={t("scoreChip.title", { label: human, score: rounded })}
      aria-label={t("scoreChip.aria", { label: human, score: rounded })}
      className={baseClass}
    >
      <span className="font-semibold">{label}</span>
      <span>{rounded}</span>
    </span>
  );
}
