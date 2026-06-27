/**
 * Hiring-manager scorecard visibility (#241).
 *
 * A SECOND, orthogonal axis to blind review (`blindReview.ts`). Blind review
 * governs what an EVALUATOR sees about their PEERS; this governs what a
 * HIRING MANAGER (a company-access viewer who is NOT an evaluator on the
 * loop) sees about the panel's scorecards. Greenhouse-style three modes,
 * configured per-job with a company-wide default:
 *
 *   • `always_show_hm`     — HM sees every submitted scorecard (default).
 *   • `always_hide_hm`     — HM never sees evaluator scorecards (confidential
 *                            / exec searches). They still drive the process;
 *                            they just don't see the scores.
 *   • `hide_hm_until_submit`— HM sees scorecards only once the panel is
 *                            complete (every evaluator submitted) OR the HM
 *                            has submitted their own — whichever first.
 *
 * Pure functions, no I/O — the service composes them with the rows + config
 * it already loaded, exactly like blindReview, so this is trivially testable.
 */

import type { ScorecardSubmissionRow } from "../../repositories/scorecardsRepository.js";

export const SCORECARD_HM_VISIBILITY_MODES = [
  "always_show_hm",
  "always_hide_hm",
  "hide_hm_until_submit",
] as const;
export type ScorecardHmVisibility = (typeof SCORECARD_HM_VISIBILITY_MODES)[number];

export const DEFAULT_HM_VISIBILITY: ScorecardHmVisibility = "always_show_hm";

export function parseHmVisibility(raw: string | null | undefined): ScorecardHmVisibility {
  return (SCORECARD_HM_VISIBILITY_MODES as readonly string[]).includes(raw as string)
    ? (raw as ScorecardHmVisibility)
    : DEFAULT_HM_VISIBILITY;
}

/**
 * Resolve the effective mode for a job: the per-job override wins, else the
 * company default, else the global default. Pure — both inputs are the raw
 * stored values (or null/undefined when unset).
 */
export function resolveHmVisibility(
  jobOverride: string | null | undefined,
  companyDefault: string | null | undefined,
): ScorecardHmVisibility {
  if (jobOverride != null && (SCORECARD_HM_VISIBILITY_MODES as readonly string[]).includes(jobOverride)) {
    return jobOverride as ScorecardHmVisibility;
  }
  return parseHmVisibility(companyDefault);
}

/**
 * Filter a panel's submissions for a hiring-manager viewer.
 *
 * `requesterIsEvaluator` short-circuits to no-op: evaluators are governed by
 * blind review, not this axis, and always keep their own rows. For a pure HM
 * viewer the three modes apply. `always_show_hm` returns everything;
 * `always_hide_hm` returns nothing; `hide_hm_until_submit` reveals only once
 * every submission in the bucket is `submitted` (the debrief-complete unlock,
 * matching blindReview's reveal point).
 */
export function filterSubmissionsForHm(
  submissions: readonly ScorecardSubmissionRow[],
  mode: ScorecardHmVisibility,
  requesterIsEvaluator: boolean,
): ScorecardSubmissionRow[] {
  if (requesterIsEvaluator || mode === "always_show_hm") return [...submissions];
  if (mode === "always_hide_hm") return [];
  // hide_hm_until_submit
  const panelComplete =
    submissions.length > 0 && submissions.every((s) => s.status === "submitted");
  return panelComplete ? [...submissions] : [];
}
