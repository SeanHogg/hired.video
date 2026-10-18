/**
 * Team Health composite (PO-8) — deterministic, documented weights. Extracted
 * so the authed route AND the embed surface compute it identically (DRY).
 *
 * Score (0–100) = weighted average of five dimensions:
 *   engagement 25% · performance 25% · goalAlignment 20% · reviewHealth 15% · communication 15%
 */

import { segmentStore } from "../../services/people-ops/segmentStore.js";
import { PeopleOpsService, defaultPeopleOpsServiceDeps } from "./peopleOpsService.js";
import type { PeopleSegmentScope } from "../../services/people-ops/segment.js";

export interface TeamHealth {
  score: number;
  dimensions: { engagement: number; performance: number; goalAlignment: number; reviewHealth: number; communication: number };
  weights: Record<string, number>;
  headcount: number;
  sampleSizes: { pulseResponses: number; checkInResponses: number; reviews: number; goals: number };
}

const WEIGHTS = { engagement: 0.25, performance: 0.25, goalAlignment: 0.2, reviewHealth: 0.15, communication: 0.15 };

export async function computeTeamHealth(ctx: PeopleSegmentScope): Promise<TeamHealth> {
  const svc = new PeopleOpsService(defaultPeopleOpsServiceDeps());
  const [employees, goals, sessions, pulseResp, checkResp, reviews] = await Promise.all([
    svc.listEmployees(ctx),
    svc.listGoals(ctx),
    svc.listOneOnOnes(ctx),
    segmentStore("pulseResponses").list(ctx),
    segmentStore("checkInResponses").list(ctx),
    segmentStore("performanceReviews").list(ctx),
  ]);

  const active = employees.filter((e) => e.status === "active");
  const headcount = active.length || 1;

  const sentiments = [...pulseResp, ...checkResp]
    .map((r: any) => r.sentiment)
    .filter((s: any): s is number => typeof s === "number");
  const engagement = sentiments.length
    ? Math.round(((sentiments.reduce((a, b) => a + b, 0) / sentiments.length) + 1) * 50)
    : 60;

  const ratings = active.map((e) => e.performanceRating).filter((r): r is number => typeof r === "number");
  const performance = ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 20) : 60;

  const goalProgress = goals.length ? goals.reduce((a, g) => a + g.progress, 0) / goals.length : 0;
  const atRiskShare = goals.length ? goals.filter((g) => g.atRisk).length / goals.length : 0;
  const goalAlignment = goals.length ? Math.max(0, Math.round(goalProgress - atRiskShare * 30)) : 60;

  const reviewHealth = reviews.length
    ? Math.round((reviews.filter((r: any) => r.status === "completed").length / reviews.length) * 100)
    : 60;

  const covered = new Set(sessions.map((s) => s.participantId));
  const communication = Math.round((Math.min(covered.size, headcount) / headcount) * 100);

  const dimensions = { engagement, performance, goalAlignment, reviewHealth, communication };
  const score = Math.round(
    engagement * WEIGHTS.engagement + performance * WEIGHTS.performance + goalAlignment * WEIGHTS.goalAlignment +
    reviewHealth * WEIGHTS.reviewHealth + communication * WEIGHTS.communication,
  );

  return {
    score,
    dimensions,
    weights: WEIGHTS,
    headcount: active.length,
    sampleSizes: { pulseResponses: pulseResp.length, checkInResponses: checkResp.length, reviews: reviews.length, goals: goals.length },
  };
}
