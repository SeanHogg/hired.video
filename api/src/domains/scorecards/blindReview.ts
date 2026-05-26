/**
 * Blind / anonymous review helpers (migration 0132 / gap #1380).
 *
 * The policy lives on the kit (`interview_kits.blind_review_mode`). Two
 * orthogonal axes:
 *
 *   • `anonymize_candidate` — when the requester is the evaluator, mask
 *     the candidate's identity fields. Hiring managers + admins always
 *     see the full picture so they can run reviews.
 *
 *   • `hide_peer_scorecards` — until the evaluator submits their own
 *     scorecard, hide peer scorecards from view. After every evaluator
 *     in the loop has submitted, peer scorecards unlock (the debrief is
 *     the natural unlock point because it only returns submitted rows).
 *
 * `both` enables both. `off` is the default.
 *
 * All helpers are pure functions — no DB calls — so they're trivially
 * testable and the service composes them with whatever it already loaded.
 */

import type {
  InterviewKitRow,
  ScorecardSubmissionRow,
} from "../../repositories/scorecardsRepository.js";

export type BlindReviewMode =
  | "off"
  | "anonymize_candidate"
  | "hide_peer_scorecards"
  | "both";

export function parseBlindReviewMode(raw: string | null | undefined): BlindReviewMode {
  if (raw === "anonymize_candidate" || raw === "hide_peer_scorecards" || raw === "both") {
    return raw;
  }
  return "off";
}

export function shouldAnonymizeCandidate(
  kit: Pick<InterviewKitRow, "blindReviewMode"> | null,
): boolean {
  if (!kit) return false;
  const mode = parseBlindReviewMode(kit.blindReviewMode);
  return mode === "anonymize_candidate" || mode === "both";
}

export function shouldHidePeerScorecards(
  kit: Pick<InterviewKitRow, "blindReviewMode"> | null,
): boolean {
  if (!kit) return false;
  const mode = parseBlindReviewMode(kit.blindReviewMode);
  return mode === "hide_peer_scorecards" || mode === "both";
}

/**
 * Returns a view of a submission with candidate identity stripped when
 * the caller is the evaluator and the kit policy demands it. HMs / admins
 * (`requesterIsEvaluator = false`) always see the unmasked row.
 */
export function maskCandidateIdentity(
  submission: ScorecardSubmissionRow,
  kit: Pick<InterviewKitRow, "blindReviewMode"> | null,
  requesterIsEvaluator: boolean,
): ScorecardSubmissionRow {
  if (!requesterIsEvaluator) return submission;
  if (!shouldAnonymizeCandidate(kit)) return submission;
  return { ...submission, candidateUserId: null };
}

/**
 * Filter a list of submissions for the requester. When peer-hiding is
 * active and the requester has a draft, peer submissions are filtered out
 * regardless of their status — the evaluator must commit their own
 * scorecard before they can see anyone else's. Once their own submission
 * is `submitted`, peers are revealed.
 */
export function filterSubmissionsForRequester(
  submissions: readonly ScorecardSubmissionRow[],
  kit: Pick<InterviewKitRow, "blindReviewMode"> | null,
  requesterUserId: string,
): ScorecardSubmissionRow[] {
  if (!shouldHidePeerScorecards(kit)) return [...submissions];
  const own = submissions.filter((s) => s.evaluatorUserId === requesterUserId);
  const everySubmittedByRequester =
    own.length > 0 && own.every((s) => s.status === "submitted");
  if (everySubmittedByRequester) return [...submissions];
  return own;
}
