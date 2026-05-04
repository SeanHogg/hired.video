import SentimentBadge from "./SentimentBadge";
import type { ScoreChipSize } from "./score-chip-styles";

/**
 * Minimum shape this component reads from a job. Sentiment is the only
 * score persisted on jobs today; if the job scorer/optimizer roadmap
 * graduates, additional sub-scores can be added here without consumers
 * changing — same DRY pattern as ResumeScoreBadges.
 */
export interface JobScores {
  sentimentScore?: number | null;
}

interface JobScoreBadgesProps {
  job: JobScores;
  size?: ScoreChipSize;
  className?: string;
}

/**
 * Cluster of score badges for a job. Returns null when nothing has
 * been scored, so consumers can drop it inline (DRY rule: shared
 * components decide their own visibility).
 */
export default function JobScoreBadges({
  job,
  size = "sm",
  className,
}: JobScoreBadgesProps) {
  if (job.sentimentScore == null) return null;
  return <SentimentBadge score={job.sentimentScore} size={size} className={className} />;
}
