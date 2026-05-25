/**
 * Pure mapping from an interview decision to the `job_applications.status`
 * value it should drive.
 *
 * Lives on its own so the propagation rule has unit tests and so the
 * decision endpoint, a future bulk-decision tool, and the candidate-facing
 * status copy can share one source of truth.
 *
 * Mapping rules (#1234):
 *   shortlist → "interviewing"     candidate cleared screening, now in pipeline
 *   maybe     → "applied"          neutral; do NOT advance the pipeline
 *   reject    → "rejected"         out of pipeline
 *   null      → "applied"          decision cleared; reset to default
 *
 * Why "interviewing" not a bespoke "screening_passed" state: JOB_PIPELINE_STATUSES
 * already enumerates the candidate pipeline, and the recruiter team treats
 * "passed the async screen" + "in live interviews" as the same funnel
 * bucket. Adding a fourth status would fragment dashboards for zero gain.
 */

export type InterviewDecision = "shortlist" | "maybe" | "reject";

/** Subset of `JOB_PIPELINE_STATUSES` (services/job/JobService.ts) we drive
 *  from a decision. Kept as a literal union here to keep this module +
 *  its unit test free of JobService transitive imports. The route layer
 *  cross-checks against the live enum when it persists, so drift between
 *  these two surfaces fails closed (status validation rejects). */
export type JobApplicationStatus = "applied" | "interviewing" | "rejected";

export function mapDecisionToApplicationStatus(
  decision: InterviewDecision | null,
): JobApplicationStatus {
  switch (decision) {
    case "shortlist":
      return "interviewing";
    case "reject":
      return "rejected";
    case "maybe":
      return "applied";
    case null:
      return "applied";
  }
}
