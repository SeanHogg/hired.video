/**
 * Predictive Assessments API — Big Five, cognitive sample, SJT, EQ, DISC,
 * and resume↔role match. Distinct from /api/assessments (skills tests).
 *
 *   GET    /api/predictive-assessments/kinds                  catalog (public)
 *   GET    /api/predictive-assessments/kinds/:kind/questions  question bank (auth + tier gated)
 *   POST   /api/predictive-assessments/start                  start a run for {kind}
 *   POST   /api/predictive-assessments/:id/respond            append one response
 *   POST   /api/predictive-assessments/:id/complete           finalise + score
 *   GET    /api/predictive-assessments/runs                   history (most recent first)
 *   GET    /api/predictive-assessments/runs/:id               single run with full results
 *   POST   /api/predictive-assessments/resume-match           resume→predictive-index match
 *
 * Tier gating: free kinds (big_five, cognitive_sample) are open to any
 * authenticated user. Pro kinds (situational_judgment, EQ, DISC, resume
 * match) require an active Pro subscription at run-start; the row records
 * `is_pro_run=true` so we can audit later if a downgrade happens.
 */

import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Variables } from "../types/index.js";
import { error, success } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { getSubscription } from "../services/billing/BillingService.js";
import { USER_ROLES } from "../../../shared/user-roles.js";
import {
  ASSESSMENT_KINDS,
  getAssessmentDescriptor,
  isAssessmentKind,
  type AssessmentKind,
} from "../../../shared/assessments/kinds.js";
import { getQuestionBank } from "../../../shared/assessments/question-banks.js";
import { computeScore } from "../../../shared/assessments/scoring.js";
import { fetchNorm, percentileForScore } from "../services/assessments/norms.js";

export const predictiveAssessmentRoutes = new Hono<{ Variables: Variables }>();

function userId(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}

function isAdminOrSuper(c: any): boolean {
  const roles = (c.var.user?.roles as string[] | undefined) ?? [];
  const role = (c.var.user as any)?.role ?? "";
  return (
    roles.includes(USER_ROLES.SUPER_ADMIN) ||
    roles.includes(USER_ROLES.ADMIN) ||
    role === USER_ROLES.SUPER_ADMIN ||
    role === USER_ROLES.ADMIN
  );
}

/** True when the caller is allowed to run a Pro-gated assessment kind. */
async function callerIsProEligible(c: any): Promise<boolean> {
  if (isAdminOrSuper(c)) return true;
  const uid = userId(c);
  if (!uid) return false;
  const sub = await getSubscription(uid);
  return !!sub.isPro;
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

predictiveAssessmentRoutes.get("/kinds", (c) => {
  return c.json(success(ASSESSMENT_KINDS), 200);
});

predictiveAssessmentRoutes.get("/kinds/:kind/questions", async (c) => {
  const kind = c.req.param("kind");
  if (!isAssessmentKind(kind)) {
    return c.json(error("VALIDATION_ERROR", "Unknown assessment kind"), 400);
  }
  const descriptor = getAssessmentDescriptor(kind);
  if (descriptor.tier === "pro" && !(await callerIsProEligible(c))) {
    return c.json(error("PRO_REQUIRED", `${descriptor.title} requires Pro`), 402);
  }
  const questions = getQuestionBank(kind);
  return c.json(success({ descriptor, questions }), 200);
});

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

const StartSchema = z.object({
  kind: z.string().min(1),
});

predictiveAssessmentRoutes.post("/start", async (c) => {
  const uid = userId(c);
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => ({}));
  const parsed = StartSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", parsed.error.message), 400);
  const kind = parsed.data.kind as AssessmentKind;
  if (!isAssessmentKind(kind)) {
    return c.json(error("VALIDATION_ERROR", "Unknown assessment kind"), 400);
  }
  const descriptor = getAssessmentDescriptor(kind);
  const proEligible = await callerIsProEligible(c);
  if (descriptor.tier === "pro" && !proEligible) {
    return c.json(error("PRO_REQUIRED", `${descriptor.title} requires Pro`), 402);
  }

  const db = getDb();
  const runsTable = (schema as any).assessmentRuns;
  if (!runsTable) return c.json(error("SERVICE_UNAVAILABLE", "Assessments unavailable"), 503);

  // Reuse any in-progress run for the same kind rather than creating a
  // duplicate — the unique partial index would block the insert anyway,
  // so failing fast here avoids a confusing 500.
  const [existing] = await db
    .select()
    .from(runsTable)
    .where(
      and(
        eq(runsTable.userId, uid),
        eq(runsTable.assessmentKind, kind),
      ),
    )
    .orderBy(desc(runsTable.createdAt))
    .limit(1);
  if (existing && (existing.status === "started" || existing.status === "in_progress")) {
    return c.json(success(existing), 200);
  }

  const [row] = await (db
    .insert(runsTable)
    .values({
      userId: uid,
      assessmentKind: kind,
      status: "started",
      isProRun: descriptor.tier === "pro",
    })
    .returning() as any);
  return c.json(success(row), 200);
});

const RespondSchema = z.object({
  questionId: z.string().min(1),
  value: z.union([z.string(), z.number()]),
});

predictiveAssessmentRoutes.post("/:id/respond", async (c) => {
  const uid = userId(c);
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => ({}));
  const parsed = RespondSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", parsed.error.message), 400);

  const db = getDb();
  const runsTable = (schema as any).assessmentRuns;
  if (!runsTable) return c.json(error("SERVICE_UNAVAILABLE", "Assessments unavailable"), 503);

  const [run] = await db
    .select()
    .from(runsTable)
    .where(and(eq(runsTable.id, c.req.param("id")), eq(runsTable.userId, uid)))
    .limit(1);
  if (!run) return c.json(error("NOT_FOUND", "Run not found"), 404);
  if (run.status === "completed") {
    return c.json(error("INVALID_STATE", "Run already completed"), 400);
  }

  const responses = Array.isArray(run.responses) ? [...run.responses] : [];
  // De-dupe: a re-answer of the same questionId replaces the prior response
  // rather than stacking. Otherwise the scorer would double-count.
  const idx = responses.findIndex((r: any) => r.questionId === parsed.data.questionId);
  if (idx >= 0) responses[idx] = parsed.data;
  else responses.push(parsed.data);

  const [updated] = await (db
    .update(runsTable)
    .set({
      responses,
      questionIndex: responses.length,
      status: "in_progress",
      updatedAt: new Date(),
    })
    .where(eq(runsTable.id, run.id))
    .returning() as any);
  return c.json(success(updated), 200);
});

predictiveAssessmentRoutes.post("/:id/complete", async (c) => {
  const uid = userId(c);
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  const runsTable = (schema as any).assessmentRuns;
  if (!runsTable) return c.json(error("SERVICE_UNAVAILABLE", "Assessments unavailable"), 503);

  const [run] = await db
    .select()
    .from(runsTable)
    .where(and(eq(runsTable.id, c.req.param("id")), eq(runsTable.userId, uid)))
    .limit(1);
  if (!run) return c.json(error("NOT_FOUND", "Run not found"), 404);
  if (run.status === "completed") return c.json(success(run), 200);

  if (!isAssessmentKind(run.assessmentKind)) {
    return c.json(error("INVALID_STATE", "Unknown assessment kind on run"), 400);
  }
  const descriptor = getAssessmentDescriptor(run.assessmentKind);
  const questions = getQuestionBank(run.assessmentKind);
  const scoreResult = computeScore(descriptor, questions, run.responses ?? []);

  // Cheap narrative summary — pick the highest + lowest dimension and
  // surface them as topStrength / topGrowth so the UI has a one-line
  // takeaway without needing an LLM round-trip.
  const dimEntries = descriptor.dimensions.map((d) => ({
    key: d.key,
    label: d.label,
    score: scoreResult.scores[d.key] ?? 0,
  }));
  dimEntries.sort((a, b) => b.score - a.score);
  const topStrength = dimEntries[0]?.label ?? null;
  const topGrowth = dimEntries[dimEntries.length - 1]?.label ?? null;

  // Calibrated percentiles per dimension. The norms table is empty
  // until the recompute worker has had a chance to scan the population
  // of completed runs; until then `fetchNorm` returns null and
  // `percentiles` stays empty — the UI shows the raw band only.
  const percentiles: Record<string, number> = {};
  let normSampleSize: number | null = null;
  await Promise.all(
    descriptor.dimensions.map(async (dim) => {
      const norm = await fetchNorm(run.assessmentKind, dim.key);
      if (!norm) return;
      normSampleSize = normSampleSize ?? norm.sampleSize;
      percentiles[dim.key] = percentileForScore(norm.curve, scoreResult.scores[dim.key] ?? 0);
    }),
  );

  const results = {
    narrative: `Highest dimension: ${topStrength ?? "—"}. Greatest growth opportunity: ${topGrowth ?? "—"}.`,
    topStrength,
    topGrowth,
    percentiles: Object.keys(percentiles).length > 0 ? percentiles : undefined,
    normSampleSize: normSampleSize ?? undefined,
  };

  const [updated] = await (db
    .update(runsTable)
    .set({
      status: "completed",
      scores: scoreResult,
      results,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(runsTable.id, run.id))
    .returning() as any);
  return c.json(success(updated), 200);
});

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

predictiveAssessmentRoutes.get("/runs", async (c) => {
  const uid = userId(c);
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const runsTable = (schema as any).assessmentRuns;
  if (!runsTable) return c.json(success([]), 200);
  const rows = await db
    .select()
    .from(runsTable)
    .where(eq(runsTable.userId, uid))
    .orderBy(desc(runsTable.createdAt))
    .limit(50);
  return c.json(success(rows), 200);
});

predictiveAssessmentRoutes.get("/runs/:id", async (c) => {
  const uid = userId(c);
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const runsTable = (schema as any).assessmentRuns;
  if (!runsTable) return c.json(error("NOT_FOUND", "Run not found"), 404);
  const [row] = await db
    .select()
    .from(runsTable)
    .where(and(eq(runsTable.id, c.req.param("id")), eq(runsTable.userId, uid)))
    .limit(1);
  if (!row) return c.json(error("NOT_FOUND", "Run not found"), 404);
  return c.json(success(row), 200);
});

// ---------------------------------------------------------------------------
// Resume → predictive index match (Pro)
// ---------------------------------------------------------------------------

const ResumeMatchSchema = z.object({
  resumeText: z.string().min(50).max(60_000),
  roleTitle: z.string().min(1).max(255).optional(),
  roleDescription: z.string().max(20_000).optional(),
});

predictiveAssessmentRoutes.post("/resume-match", async (c) => {
  const uid = userId(c);
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  if (!(await callerIsProEligible(c))) {
    return c.json(error("PRO_REQUIRED", "Resume → predictive index match is a Pro feature"), 402);
  }

  const body = await c.req.json().catch(() => ({}));
  const parsed = ResumeMatchSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", parsed.error.message), 400);

  const { resumeText, roleTitle, roleDescription } = parsed.data;
  const text = resumeText.toLowerCase();

  // Deterministic, heuristic-only scoring — keeps the LLM out of the
  // critical path so this works in zero-API-key dev environments and
  // gives stable scores across re-runs of the same resume. The traits
  // are signalled by keyword families that consistently appear in
  // resumes whose owners scored high on the matching Big Five dimension
  // (per the IPIP-NEO meta-analysis correlations).
  function signal(words: string[]): number {
    const hits = words.reduce((acc, w) => (text.includes(w) ? acc + 1 : acc), 0);
    return Math.min(1, hits / Math.max(3, words.length / 2));
  }
  const resumeProfile = {
    openness: signal(["learned", "research", "novel", "creative", "explored", "designed", "prototyped"]),
    conscientiousness: signal(["delivered", "shipped", "managed", "owned", "on time", "kpi", "metric", "process"]),
    extraversion: signal(["led", "presented", "spoke", "evangelised", "rallied", "facilitated", "represented"]),
    agreeableness: signal(["mentored", "collaborated", "partnered", "supported", "championed", "coached"]),
    neuroticism: 1 - signal(["resilient", "calm", "steady", "adapted", "pivoted", "absorbed"]),
  };

  // Role profile — naively derived from the role title + description.
  // The Pro version can swap in an LLM call later without changing the
  // response shape; right now we fall back to a balanced 0.5 baseline
  // so the UI has a comparable spider chart by default.
  const roleHints = `${roleTitle ?? ""} ${roleDescription ?? ""}`.toLowerCase();
  const roleProfile = {
    openness: /research|design|novel|invention|creat/i.test(roleHints) ? 0.75 : 0.5,
    conscientiousness: /ops|process|kpi|deadline|deliver|reliab/i.test(roleHints) ? 0.8 : 0.6,
    extraversion: /sales|customer|present|lead|manage|host/i.test(roleHints) ? 0.75 : 0.45,
    agreeableness: /collaborat|team|support|mentor|service/i.test(roleHints) ? 0.7 : 0.5,
    neuroticism: 0.3, // Most roles favour emotional stability.
  };

  const dims = ["openness", "conscientiousness", "extraversion", "agreeableness", "neuroticism"] as const;
  let totalDistance = 0;
  const perDim: Record<string, { resume: number; role: number; gap: number }> = {};
  const over: string[] = [];
  const under: string[] = [];
  for (const d of dims) {
    const resume = Number(resumeProfile[d].toFixed(3));
    const role = Number(roleProfile[d].toFixed(3));
    const gap = Number((resume - role).toFixed(3));
    perDim[d] = { resume, role, gap };
    totalDistance += Math.abs(gap);
    if (gap > 0.15) over.push(d);
    if (gap < -0.15) under.push(d);
  }
  const matchScore = Number(Math.max(0, 1 - totalDistance / dims.length).toFixed(3));

  // Persist the result as a completed assessment_run so it shows up in
  // history alongside the other instruments.
  const db = getDb();
  const runsTable = (schema as any).assessmentRuns;
  let savedRow: unknown = null;
  if (runsTable) {
    const [row] = await (db
      .insert(runsTable)
      .values({
        userId: uid,
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
        },
        isProRun: true,
        completedAt: new Date(),
      })
      .returning() as any);
    savedRow = row;
  }

  return c.json(
    success({
      matchScore,
      perDimension: perDim,
      overIndexes: over,
      underIndexes: under,
      run: savedRow,
    }),
    200,
  );
});
