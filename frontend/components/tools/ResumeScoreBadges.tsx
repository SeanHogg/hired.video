import SentimentBadge from "./SentimentBadge";
import { cn } from "@/lib/utils";

/**
 * Minimal shape this component needs from a Resume. Keeps the badge
 * cluster decoupled from the full Resume type so it can render on
 * summaries, list rows, public-shared pages, etc. Sentiment is the
 * only persisted score today; ATS / keyword / format / impact /
 * overall will join here once they're persisted (phase 2).
 */
export interface ResumeScores {
  sentimentScore?: number | null;
}

interface ResumeScoreBadgesProps {
  resume: ResumeScores;
  size?: "sm" | "md";
  className?: string;
}

/**
 * Cluster of score badges for a resume. Renders only the scores that
 * have been computed; returns null when nothing is scored yet so
 * consumers can drop it inline without gating themselves (DRY rule:
 * shared components decide their own visibility).
 */
export default function ResumeScoreBadges({
  resume,
  size = "sm",
  className,
}: ResumeScoreBadgesProps) {
  const hasAny = resume.sentimentScore != null;
  if (!hasAny) return null;

  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <SentimentBadge score={resume.sentimentScore} size={size} />
    </span>
  );
}
