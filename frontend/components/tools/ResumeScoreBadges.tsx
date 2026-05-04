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
}

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

  return (
    <span className={cn("inline-flex items-center gap-1 flex-wrap", className)}>
      <ScoreChip
        label="Overall"
        fullLabel="Overall score"
        score={scores?.overall}
        size={size}
      />
      <SentimentBadge score={resume.sentimentScore} size={size} />
      <ScoreChip
        label="ATS"
        fullLabel="ATS compatibility"
        score={scores?.ats}
        size={size}
      />
      <ScoreChip
        label="KW"
        fullLabel="Keyword match"
        score={scores?.keyword}
        size={size}
      />
      <ScoreChip
        label="Fmt"
        fullLabel="Format"
        score={scores?.format}
        size={size}
      />
      <ScoreChip
        label="Cnt"
        fullLabel="Content quality"
        score={scores?.content}
        size={size}
      />
      <ScoreChip
        label="Imp"
        fullLabel="Impact"
        score={scores?.impact}
        size={size}
      />
    </span>
  );
}
