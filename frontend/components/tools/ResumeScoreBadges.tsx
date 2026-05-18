import SentimentBadge from "./SentimentBadge";
import ScoreChip from "./ScoreChip";
import type { ScoreChipSize } from "./score-chip-styles";
import { cn } from "@/lib/utils";

/**
 * Minimum shape this component reads from a resume. Decoupled from the
 * full Resume type so the component can render on summaries, list rows,
 * detail headers, etc.
 *
 *   sentimentScore — persisted on its own column (resume_information.sentiment_score)
 *   scores         — persisted JSONB blob (resume_information.scores)
 *                    written by the resume scorer and resume optimizer.
 */
export interface ResumeScores {
  sentimentScore?: number | null;
  scores?: {
    overall?: number;
    ats?: number;
    content?: number;
    keyword?: number;
    format?: number;
    impact?: number;
  } | null;
}

interface ResumeScoreBadgesProps {
  resume: ResumeScores;
  size?: ScoreChipSize;
  className?: string;
  /** When provided, each chip becomes a button that fires this with the
   *  catalog tool id that produced the score. Surfaces use this to open
   *  the tool-history sheet at the right tool. Omit on read-only contexts
   *  (e.g. public profile) and the chips render as plain badges. */
  onChipClick?: (toolId: string) => void;
  /** Show only the Overall chip. Used by tight rows like the resume
   *  picker where the full sub-score cluster overflows the row. */
  compact?: boolean;
}

/**
 * Catalog tool id that produces each score. Centralised here so every
 * surface that renders these badges deep-links consistently.
 *
 * The ai-resume-scorer writes the full 6-score blob (overall + ATS +
 * content + keyword + format + impact); the resume-optimizer also writes
 * ATS but the scorer is the more complete history view, so it wins for
 * the shared sub-scores.
 */
const SCORE_TOOL_ID = "ai-resume-scorer";
const SENTIMENT_TOOL_ID = "sentiment-analysis";

/**
 * Cluster of score badges for a resume. Renders only the scores that
 * have been computed; returns null when nothing is scored yet so
 * consumers can drop it inline without gating themselves (DRY rule:
 * shared components decide their own visibility).
 *
 * Order: Overall → Sentiment → ATS → Keyword → Format → Content → Impact.
 * Overall comes first because it's the headline; sentiment second
 * because the heart icon is the most recognizable; the rest are
 * sub-scores in a stable order.
 */
export default function ResumeScoreBadges({
  resume,
  size = "sm",
  className,
  onChipClick,
  compact = false,
}: ResumeScoreBadgesProps) {
  const scores = resume.scores;
  const hasAny =
    resume.sentimentScore != null ||
    (scores != null &&
      (scores.overall != null ||
        scores.ats != null ||
        scores.content != null ||
        scores.keyword != null ||
        scores.format != null ||
        scores.impact != null));
  if (!hasAny) return null;

  const onScore = onChipClick ? () => onChipClick(SCORE_TOOL_ID) : undefined;
  const onSentiment = onChipClick ? () => onChipClick(SENTIMENT_TOOL_ID) : undefined;

  if (compact) {
    return (
      <span className={cn("inline-flex items-center gap-1", className)}>
        <ScoreChip
          label="Overall"
          fullLabel="Overall score"
          score={scores?.overall}
          size={size}
          onClick={onScore}
        />
      </span>
    );
  }

  return (
    <span className={cn("inline-flex items-center gap-1 flex-wrap", className)}>
      <ScoreChip
        label="Overall"
        fullLabel="Overall score"
        score={scores?.overall}
        size={size}
        onClick={onScore}
      />
      <SentimentBadge
        score={resume.sentimentScore}
        size={size}
        onClick={onSentiment}
      />
      <ScoreChip
        label="ATS"
        fullLabel="ATS compatibility"
        score={scores?.ats}
        size={size}
        onClick={onScore}
      />
      <ScoreChip
        label="KW"
        fullLabel="Keyword match"
        score={scores?.keyword}
        size={size}
        onClick={onScore}
      />
      <ScoreChip
        label="Fmt"
        fullLabel="Format"
        score={scores?.format}
        size={size}
        onClick={onScore}
      />
      <ScoreChip
        label="Cnt"
        fullLabel="Content quality"
        score={scores?.content}
        size={size}
        onClick={onScore}
      />
      <ScoreChip
        label="Imp"
        fullLabel="Impact"
        score={scores?.impact}
        size={size}
        onClick={onScore}
      />
    </span>
  );
}
