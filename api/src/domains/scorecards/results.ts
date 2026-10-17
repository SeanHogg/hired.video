/** Scorecards use-case result shapes (rows enriched with children). */

import type {
  ScorecardTemplateRow,
  ScorecardAttributeRow,
  InterviewKitRow,
  InterviewKitStageRow,
  ScorecardSubmissionRow,
  ScorecardSubmissionRatingRow,
  CompetencyRow,
  CompetencyLevelRow,
} from "../../repositories/scorecardsRepository.js";
import type { AggregateSnapshot, AttributeAverage } from "./scoring.js";

export interface TemplateWithAttributes extends ScorecardTemplateRow {
  attributes: ScorecardAttributeRow[];
}

export interface KitWithStages extends InterviewKitRow {
  stages: InterviewKitStageRow[];
}

export interface SubmissionWithRatings extends ScorecardSubmissionRow {
  ratings: ScorecardSubmissionRatingRow[];
}

export interface Debrief {
  submissions: ScorecardSubmissionRow[];
  avgScore: AggregateSnapshot["avgScore"];
  recommendations: AggregateSnapshot["recommendations"];
  attributes: AttributeAverage[];
}

export interface CompetencyWithLevels extends CompetencyRow {
  levels: CompetencyLevelRow[];
}
