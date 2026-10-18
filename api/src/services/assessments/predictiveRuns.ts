/**
 * Predictive assessment runs — start / respond / complete lifecycle plus the
 * heuristic resume → predictive-index match. Data access is
 * AssessmentRunsRepository; failures are DomainErrors carrying the same
 * status/code the route always returned.
 */
import { DomainError } from "../../domains/errors.js";
import {
  AssessmentRunsRepository,
  type AssessmentRun,
  type NewAssessmentRun,
} from "../../repositories/assessmentRunsRepository.js";
import { getSubscription } from "../billing/BillingService.js";
import { isAdminRole } from "../../middleware/superAdmin.js";
import type { JwtPayload } from "../../types/index.js";
import {
  getAssessmentDescriptor,
  isAssessmentKind,
  type AssessmentKind,
} from "../../../../shared/assessments/kinds.js";
import { getQuestionBank } from "../../../../shared/assessments/question-banks.js";
import { computeScore } from "../../../../shared/assessments/scoring.js";
import { fetchNormsForKind, percentileForScore } from "./norms.js";

/** True when the caller is allowed to run a Pro-gated assessment kind. */
export async function isProEligible(user: JwtPayload | undefined, userId: string | undefined): Promise<boolean> {
  if (isAdminRole(user)) return true;
  if (!userId) return false;
  const sub = await getSubscription(userId);
  return !!sub.isPro;
}

/** Starts (or resumes the in-progress) run of `kind`. Pro gating is the caller's
 *  `proEligible` decision so the 402 stays ahead of any DB work. */
export async function startPredictiveRun(
  userId: string,
  kind: AssessmentKind,
  repo = new AssessmentRunsRepository(),
): Promise<AssessmentRun> {
  const descriptor = getAssessmentDescriptor(kind);
  // Reuse any in-progress run for the same kind rather than creating a
  // duplicate — the unique partial index would block the insert anyway,
  // so failing fast here avoids a confusing 500.
  const existing = await repo.findLatestForKind(userId, kind);
  if (existing && (existing.status === "started" || existing.status === "in_progress")) return existing;

  return repo.insert({ userId, assessmentKind: kind, status: "started", isProRun: descriptor.tier === "pro" });
}

async function requireOwnedRun(repo: AssessmentRunsRepository, userId: string, id: string): Promise<AssessmentRun> {
  const run = await repo.findOwned(userId, id);
  if (!run) throw new DomainError(404, "NOT_FOUND", "Run not found");
  return run;
}

export async function getPredictiveRun(userId: string, id: string, repo = new AssessmentRunsRepository()) {
  return requireOwnedRun(repo, userId, id);
}

export async function respondToPredictiveRun(
  userId: string,
  id: string,
  response: { questionId: string; value: string | number },
  repo = new AssessmentRunsRepository(),
): Promise<AssessmentRun> {
  const run = await requireOwnedRun(repo, userId, id);
  if (run.status === "completed") throw new DomainError(400, "INVALID_STATE", "Run already completed");

  const responses = Array.isArray(run.responses) ? [...run.responses] : [];
  // De-dupe: a re-answer of the same questionId replaces the prior response
  // rather than stacking. Otherwise the scorer would double-count.
  const idx = responses.findIndex((r) => r.questionId === response.questionId);
  if (idx >= 0) responses[idx] = response;
  else responses.push(response);

  return repo.update(run.id, { responses, questionIndex: responses.length, status: "in_progress" });
}

export async function completePredictiveRun(
  userId: string,
  id: string,
  repo = new AssessmentRunsRepository(),
): Promise<AssessmentRun> {
  const run = await requireOwnedRun(repo, userId, id);
  if (run.status === "completed") return run;
  if (!isAssessmentKind(run.assessmentKind)) {
    throw new DomainError(400, "INVALID_STATE", "Unknown assessment kind on run");
  }

  const descriptor = getAssessmentDescriptor(run.assessmentKind);
  const questions = getQuestionBank(run.assessmentKind);
  const scoreResult = computeScore(descriptor, questions, run.responses ?? []);

  // Cheap narrative summary — highest + lowest dimension as topStrength /
  // topGrowth so the UI has a one-line takeaway without an LLM round-trip.
  const dimEntries = descriptor.dimensions.map((d) => ({
    key: d.key,
    label: d.label,
    score: scoreResult.scores[d.key] ?? 0,
  }));
  dimEntries.sort((a, b) => b.score - a.score);
  const topStrength = dimEntries[0]?.label ?? null;
  const topGrowth = dimEntries[dimEntries.length - 1]?.label ?? null;

  // Calibrated percentiles per dimension — empty until the norms recompute
  // worker has scanned completed runs (the UI then shows the raw band only).
  const percentiles: Record<string, number> = {};
  let normSampleSize: number | null = null;
  const norms = await fetchNormsForKind(run.assessmentKind);
  for (const dim of descriptor.dimensions) {
    const norm = norms.get(dim.key);
    if (!norm) continue;
    normSampleSize = normSampleSize ?? norm.sampleSize;
    percentiles[dim.key] = percentileForScore(norm.curve, scoreResult.scores[dim.key] ?? 0);
  }

  const results = {
    narrative: `Highest dimension: ${topStrength ?? "—"}. Greatest growth opportunity: ${topGrowth ?? "—"}.`,
    topStrength,
    topGrowth,
    percentiles: Object.keys(percentiles).length > 0 ? percentiles : undefined,
    normSampleSize: normSampleSize ?? undefined,
  };

  return repo.update(run.id, {
    status: "completed",
    scores: scoreResult,
    results: results as unknown as NewAssessmentRun["results"],
    completedAt: new Date(),
  });
}

// ---------------------------------------------------------------------------
// Resume → predictive index match (Pro)
// ---------------------------------------------------------------------------

const BIG_FIVE = ["openness", "conscientiousness", "extraversion", "agreeableness", "neuroticism"] as const;

export interface ResumeMatchInput {
  resumeText: string;
  roleTitle?: string;
  roleDescription?: string;
}

/**
 * Deterministic, heuristic-only scoring — keeps the LLM out of the critical
 * path so this works in zero-API-key dev environments and gives stable scores
 * across re-runs. Traits are signalled by keyword families that consistently
 * appear in resumes whose owners scored high on the matching Big Five
 * dimension (IPIP-NEO meta-analysis correlations). The result is persisted as
 * a completed run so it shows in history alongside the other instruments.
 */
export async function matchResumeToPredictiveIndex(
  userId: string,
  { resumeText, roleTitle, roleDescription }: ResumeMatchInput,
  repo = new AssessmentRunsRepository(),
) {
  const text = resumeText.toLowerCase();
  const signal = (words: string[]): number => {
    const hits = words.reduce((acc, w) => (text.includes(w) ? acc + 1 : acc), 0);
    return Math.min(1, hits / Math.max(3, words.length / 2));
  };
  const resumeProfile = {
    openness: signal(["learned", "research", "novel", "creative", "explored", "designed", "prototyped"]),
    conscientiousness: signal(["delivered", "shipped", "managed", "owned", "on time", "kpi", "metric", "process"]),
    extraversion: signal(["led", "presented", "spoke", "evangelised", "rallied", "facilitated", "represented"]),
    agreeableness: signal(["mentored", "collaborated", "partnered", "supported", "championed", "coached"]),
    neuroticism: 1 - signal(["resilient", "calm", "steady", "adapted", "pivoted", "absorbed"]),
  };

  // Role profile — naively derived from the role title + description, with a
  // balanced baseline so the UI has a comparable spider chart by default.
  const roleHints = `${roleTitle ?? ""} ${roleDescription ?? ""}`.toLowerCase();
  const roleProfile = {
    openness: /research|design|novel|invention|creat/i.test(roleHints) ? 0.75 : 0.5,
    conscientiousness: /ops|process|kpi|deadline|deliver|reliab/i.test(roleHints) ? 0.8 : 0.6,
    extraversion: /sales|customer|present|lead|manage|host/i.test(roleHints) ? 0.75 : 0.45,
    agreeableness: /collaborat|team|support|mentor|service/i.test(roleHints) ? 0.7 : 0.5,
    neuroticism: 0.3, // Most roles favour emotional stability.
  };

  let totalDistance = 0;
  const perDim: Record<string, { resume: number; role: number; gap: number }> = {};
  const over: string[] = [];
  const under: string[] = [];
  for (const d of BIG_FIVE) {
    const resume = Number(resumeProfile[d].toFixed(3));
    const role = Number(roleProfile[d].toFixed(3));
    const gap = Number((resume - role).toFixed(3));
    perDim[d] = { resume, role, gap };
    totalDistance += Math.abs(gap);
    if (gap > 0.15) over.push(d);
    if (gap < -0.15) under.push(d);
  }
  const matchScore = Number(Math.max(0, 1 - totalDistance / BIG_FIVE.length).toFixed(3));

  const run = await repo.insert({
    userId,
    assessmentKind: "resume_predictive_match",
    status: "completed",
    questionIndex: 0,
    responses: [],
    scores: { scores: { match_score: matchScore }, counts: { match_score: 1 }, overall: matchScore },
    results: {
      narrative: roleTitle
        ? `Match against "${roleTitle}" — ${(matchScore * 100).toFixed(0)}%.`
        : `Resume signal across the five-factor model — ${(matchScore * 100).toFixed(0)}% baseline match.`,
      topStrength: over[0] ?? null,
      topGrowth: under[0] ?? null,
      roleAlignment: perDim as unknown as Record<string, number>,
    } as unknown as NewAssessmentRun["results"],
    isProRun: true,
    completedAt: new Date(),
  });

  return { matchScore, perDimension: perDim, overIndexes: over, underIndexes: under, run };
}
