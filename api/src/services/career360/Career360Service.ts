/**
 * Career360Service — single owner of the "I want to become X — what's
 * my gap and the plan?" flow that powers /api/career360.
 *
 * Three responsibilities:
 *   1. propose 3 candidate targets for the seeker (LLM, cheap),
 *   2. given a chosen target, derive a rubric + gap analysis + roadmap
 *      and persist the whole document on `user_profiles.career_target`,
 *   3. assemble per-signal score history from `tool_runs` so the wheel
 *      can render progress stamps without a second round-trip.
 *
 * Acceptance is intentionally NOT handled here — the user closes gaps
 * by running the linked tools (Resume Optimizer, Profile Audit, Skill
 * Extractor, …) and re-running `select` later refreshes the gap +
 * roadmap against the current state.
 */

import type { Career360StateResponse } from "../../../../shared/career360-types.js";
import { loadDoc } from "./doc-store.js";
import { loadScoreHistory } from "./score-history.js";
import { computeOutcomes, loadFunnelCounts } from "./outcomes.js";

export { suggestTargets, selectTarget, clearTarget } from "./targets.js";
export { evaluateItem, setItemResolved } from "./evaluation.js";
export { computeOutcomes } from "./outcomes.js";
export type { FunnelCounts } from "./outcomes.js";

export async function getCareer360State(userId: string): Promise<Career360StateResponse> {
  // Independent reads — fan out so the funnel aggregate doesn't serialise
  // behind the doc/history loads.
  const [doc, history, funnel] = await Promise.all([
    loadDoc(userId),
    loadScoreHistory(userId),
    loadFunnelCounts(userId),
  ]);
  return { doc, history, outcomes: computeOutcomes(funnel, doc) };
}
