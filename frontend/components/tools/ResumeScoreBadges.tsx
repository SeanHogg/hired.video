import SentimentBadge from "./SentimentBadge";
import ScoreChip from "./ScoreChip";
import type { ScoreChipSize } from "./score-chip-styles";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { ResumeScores } from "@shared/scores";

/**
 * Minimum shape this component reads from a resume. Decoupled from the
 * full Resume type so the component can render on summaries, list rows,
 * detail headers, etc.
 *
 *   sentimentScore — persisted on its own column (resume_information.sentiment_score)
 *   scores         — persisted JSONB blob (resume_information.scores)
 *                    written by the resume scorer and resume optimizer.
 */
export interface ResumeScoreFields {
  sentimentScore?: number | null;
  scores?: ResumeScores | null;
}

interface ResumeScoreBadgesProps {
  resume: ResumeScoreFields;
  size?: ScoreChipSize;
  className?: string;
  /** When provided, each chip becomes a button that fires this with the
   *  catalog tool id(s) that produced the score. Surfaces use this to
   *  open the tool-history sheet pre-expanded on every matching tool.
   *  Most chips return a single id; ATS returns two because both
   *  `ai-resume-scorer` and `resume-optimizer` write `scores.ats`, so
   *  the panel needs to expand both groups for the user to actually
   *  see the run that produced the visible chip. Omit on read-only
   *  contexts (e.g. public profile) and the chips render as plain
   *  badges. */
  onChipClick?: (toolIds: readonly string[]) => void;
  /** Show only the Overall chip. Used by tight rows like the resume
   *  picker where the full sub-score cluster overflows the row. */
  compact?: boolean;
}

/**
 * Catalog tool id(s) that produce each score. Centralised here so every
 * surface that renders these badges deep-links consistently.
 *
 * The ai-resume-scorer writes the full 6-score blob (overall + ATS +
 * content + keyword + format + impact). The resume-optimizer also writes
 * `scores.ats` via `persistResumeScoresIfReferenced`, so a user who only
 * ran the Optimizer sees an ATS chip on the card — clicking it must open
 * both groups so the optimizer-only run isn't invisible below the fold.
 */
const SCORER_TOOL_ID = "ai-resume-scorer";
const OPTIMIZER_TOOL_ID = "resume-optimizer";
const SENTIMENT_TOOL_ID = "sentiment-analysis";

const SCORE_TOOL_IDS = [SCORER_TOOL_ID] as const;
const ATS_SCORE_TOOL_IDS = [SCORER_TOOL_ID, OPTIMIZER_TOOL_ID] as const;
const SENTIMENT_TOOL_IDS = [SENTIMENT_TOOL_ID] as const;

type ScoreKey = "overall" | "ats" | "keyword" | "format" | "content" | "impact";

/** Sub-score chips after Sentiment, in display order. Labels are i18n keys. */
const SUB_SCORE_CHIPS: ReadonlyArray<{
  key: Exclude<ScoreKey, "overall">;
  labelKey: string;
  fullLabelKey: string;
}> = [
  { key: "ats", labelKey: "toolSteps.scoreChip.ats", fullLabelKey: "toolSteps.scoreChip.atsFull" },
  { key: "keyword", labelKey: "toolSteps.scoreChip.keyword", fullLabelKey: "toolSteps.scoreChip.keywordFull" },
  { key: "format", labelKey: "toolSteps.scoreChip.format", fullLabelKey: "metrics.format" },
  { key: "content", labelKey: "toolSteps.scoreChip.content", fullLabelKey: "toolSteps.scoreChip.contentFull" },
  { key: "impact", labelKey: "toolSteps.scoreChip.impact", fullLabelKey: "metrics.impact" },
];

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
  const { t } = useTranslation();
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

  const onScore = onChipClick ? () => onChipClick(SCORE_TOOL_IDS) : undefined;
  const onAtsScore = onChipClick ? () => onChipClick(ATS_SCORE_TOOL_IDS) : undefined;
  const onSentiment = onChipClick ? () => onChipClick(SENTIMENT_TOOL_IDS) : undefined;

  const overallChip = (
    <ScoreChip
      label={t("toolSteps.scoreChip.overall")}
      fullLabel={t("toolSteps.scoreChip.overallFull")}
      score={scores?.overall}
      size={size}
      onClick={onScore}
    />
  );

  if (compact) {
    return (
      <span className={cn("inline-flex items-center gap-1", className)}>
        {overallChip}
      </span>
    );
  }

  return (
    <span className={cn("inline-flex items-center gap-1 flex-wrap", className)}>
      {overallChip}
      <SentimentBadge
        score={resume.sentimentScore}
        size={size}
        onClick={onSentiment}
      />
      {SUB_SCORE_CHIPS.map((chip) => (
        <ScoreChip
          key={chip.key}
          label={t(chip.labelKey)}
          fullLabel={t(chip.fullLabelKey)}
          score={scores?.[chip.key]}
          size={size}
          onClick={chip.key === "ats" ? onAtsScore : onScore}
        />
      ))}
    </span>
  );
}
