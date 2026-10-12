/**
 * The Target stage's job match — "Match for <job>": a 0–100 score, the
 * keywords the résumé already shows (found) and the ones the job asks for
 * that it does not (missing). Derived, never stored. Pure.
 *
 * Sources, in order:
 *   1. the open review — a tailor (estimated tailored score, the keywords
 *      it found on the résumé + the job's gaps; a gap the person confirmed
 *      counts as found) or create-from-a-job
 *      (requirements covered / partial = found, gap = missing; the score is
 *      the share covered). While that review loads there is no match yet;
 *   2. otherwise the latest finished Job Match tool run (its matched /
 *      missing keywords, normalized into strengths / weaknesses, and the
 *      job label the run recorded).
 */
import type { JobGap } from "@shared/resume-tailor";
import type { JobRequirement } from "@shared/resume-from-job";
import type { ReviewCore, ReviewKind } from "./review/review-model";
import type { GapAnswer } from "./review/use-gap-answers";
import type { ToolRun } from "./use-tool-runs";

export type JobMatchSource = "tailor" | "fromJob" | "tool";

export interface JobMatch {
  /** "VP Engineering · Northwind Health"; null when the source does not name the job. */
  jobLabel: string | null;
  score: number;
  /** The score before tailoring (tailor only). */
  scoreBefore?: number;
  found: string[];
  missing: string[];
  /** Tailor / fromJob = an unsaved review; tool = scored against the open résumé. */
  source: JobMatchSource;
}

/** The parts of a tailor review the match reads (TailorReview satisfies it). */
export interface TailorMatchInput {
  kind: "tailor";
  status: ReviewCore["status"];
  job: { label: string };
  score: number;
  oldScore: number;
  gaps: readonly JobGap[];
  /** Job keywords the tailor found already on the résumé (#2344). */
  matchedKeywords: readonly string[];
  answers: { answerOf: (id: string) => GapAnswer };
}

/** The parts of a create-from-a-job review the match reads (JobDraftReview satisfies it). */
export interface FromJobMatchInput {
  kind: "fromJob";
  status: ReviewCore["status"];
  subject: string;
  requirements: readonly JobRequirement[];
}

export type MatchReviewInput =
  | TailorMatchInput
  | FromJobMatchInput
  | { kind: Exclude<ReviewKind, "tailor" | "fromJob"> };

export const JOB_MATCH_TOOL_ID = "job-resume-match";

const clampScore = (n: number) => Math.round(Math.max(0, Math.min(100, n)));

/** Trimmed, non-empty, first spelling wins (case-insensitive). */
function uniqueKeywords(items: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const item = raw.trim();
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

const gapKeyword = (gap: JobGap) => gap.skill?.trim() || gap.requirement;

function fromTailor(review: TailorMatchInput): JobMatch {
  const confirmed = (gap: JobGap) => review.answers.answerOf(gap.id).status === "confirmed";
  return {
    jobLabel: review.job.label.trim() || null,
    score: clampScore(review.score),
    scoreBefore: clampScore(review.oldScore),
    found: uniqueKeywords([...review.matchedKeywords, ...review.gaps.filter(confirmed).map(gapKeyword)]),
    missing: uniqueKeywords(review.gaps.filter((g) => !confirmed(g)).map(gapKeyword)),
    source: "tailor",
  };
}

function fromJobDraft(review: FromJobMatchInput): JobMatch | null {
  const total = review.requirements.length;
  if (total === 0) return null;
  const found = review.requirements.filter((r) => r.status !== "gap");
  return {
    jobLabel: review.subject.trim() || null,
    score: clampScore((found.length / total) * 100),
    found: uniqueKeywords(found.map((r) => r.text)),
    missing: uniqueKeywords(review.requirements.filter((r) => r.status === "gap").map((r) => r.text)),
    source: "fromJob",
  };
}

/** The latest finished Job Match run with a score. */
export function latestJobMatchRun(runs: readonly ToolRun[]): JobMatch | null {
  for (let i = runs.length - 1; i >= 0; i -= 1) {
    const run = runs[i];
    if (run.status !== "done" || run.toolId !== JOB_MATCH_TOOL_ID) continue;
    const { overallScore, strengths, weaknesses } = run.result;
    if (typeof overallScore !== "number") continue;
    return {
      jobLabel: run.result.jobLabel?.trim() || null,
      score: clampScore(overallScore),
      found: uniqueKeywords(strengths ?? []),
      missing: uniqueKeywords(weaknesses ?? []),
      source: "tool",
    };
  }
  return null;
}

/** The match to show beside the résumé, or null when no job is attached. */
export function deriveJobMatch(review: MatchReviewInput | null, runs: readonly ToolRun[]): JobMatch | null {
  if (review?.kind === "tailor") return review.status === "ready" ? fromTailor(review) : null;
  if (review?.kind === "fromJob") return review.status === "ready" ? fromJobDraft(review) : null;
  return latestJobMatchRun(runs);
}
