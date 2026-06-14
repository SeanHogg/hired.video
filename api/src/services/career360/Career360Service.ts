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

import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "../../db/index.js";
import { createLLMClient, defineLenientIngest } from "../adapters/llm-client.js";
import { recordTokenUsage } from "../billing/BillingService.js";
import { getOrSetCached } from "../../utils/edge-cache.js";
import {
  CareerTargetDocSchema,
  EvaluateRequestSchema,
  EvaluationResultSchema,
  GapSchema,
  SuggestTargetsResponseSchema,
  TargetRubricSchema,
  type CareerTargetDoc,
  type Career360Outcomes,
  type Career360StateResponse,
  type EvaluateRequest,
  type EvaluationResult,
  type Gap,
  type OutcomeSegmentId,
  type OutcomeSignal,
  type RoadmapStep,
  type ScoreHistorySeries,
  type SelectedTarget,
  type SelectTargetRequest,
  type TargetSuggestion,
} from "../../../../shared/career360-types.js";
import { ResumeContentSchema } from "../../../../shared/resume.js";
import type { JwtPayload } from "../../types/index.js";
import type { LLMEnv } from "../adapters/llm-client.js";

const { users, userProfiles, toolRuns, resumeInformation, savedJobs } = schema;

// Tool ids whose `tool_runs.score` we plot as a sparkline under the
// wheel. Stays in one place so adding a new "scored" tool is one line.
const SCORED_TOOL_IDS = [
  "ai-resume-scorer",
  "resume-optimizer",
  "profile-audit",
  "sentiment-analysis",
  "job-resume-match",
] as const;

const TOOL_LABELS: Record<(typeof SCORED_TOOL_IDS)[number], string> = {
  "ai-resume-scorer": "Resume Score",
  "resume-optimizer": "Resume Optimizer",
  "profile-audit": "Profile Audit",
  "sentiment-analysis": "Sentiment",
  "job-resume-match": "Job Match",
};

/** The four legal horizon buckets the UI groups roadmap steps under.
 *  Matches the strict enum on `RoadmapStepSchema.horizon`. */
const HORIZON_BUCKETS = ["30d", "60d", "90d", "180d"] as const;
type Horizon = (typeof HORIZON_BUCKETS)[number];

/** Lenient ingest shape for the LLM's plan response. Free-tier models
 *  (qwen, gemma) drift on later roadmap items and emit horizons like
 *  "6m", "1y", "4w", or "30 days" — values the strict
 *  `RoadmapStepSchema` enum rejects, which previously took down a whole
 *  multi-model fallback chain (per the AI vendor's analysis on
 *  2026-05-10). Accepting `string` here lets the call succeed; the
 *  service then maps each horizon onto a legal bucket via
 *  `normalizeHorizon` before constructing the canonical
 *  `RoadmapStepSchema`-shaped roadmap. */
const LenientRoadmapStepSchema = z.object({
  id: z.string().min(1),
  horizon: z.string().min(1),
  title: z.string().min(1).max(200),
  detail: z.string().max(600),
  closesGapIds: z.array(z.string()).default([]),
});

const LenientPlanResponseSchema = z.object({
  rubric: TargetRubricSchema,
  gaps: z.array(GapSchema).min(1).max(20),
  roadmap: z.array(LenientRoadmapStepSchema).min(1).max(20),
});

/** Map any LLM-emitted horizon string onto the nearest legal bucket.
 *
 *  Accepts: canonical `30d`/`60d`/`90d`/`180d` (passes through), plus
 *  any `\d+\s*(d|w|m|y|day|week|month|year)s?` form including
 *  `"6 months"`, `"4w"`, `"1y"`, `"30 days"`. Anything unparseable
 *  defaults to `"30d"` — the immediacy bucket is the safest fallback
 *  since the seeker can always defer a "do this in 30 days" item, but
 *  burying real near-term work under a 6-month label hides it. */
function normalizeHorizon(raw: string): Horizon {
  const s = raw.trim().toLowerCase();
  if ((HORIZON_BUCKETS as readonly string[]).includes(s)) return s as Horizon;
  const match = s.match(/(\d+)\s*(d|w|m|y|day|week|month|year)/);
  if (!match) return "30d";
  const n = Number.parseInt(match[1], 10);
  if (!Number.isFinite(n) || n <= 0) return "30d";
  const unit = match[2][0]; // d / w / m / y
  const days =
    unit === "w" ? n * 7
    : unit === "m" ? n * 30
    : unit === "y" ? n * 365
    : n;
  if (days <= 45) return "30d";
  if (days <= 75) return "60d";
  if (days <= 135) return "90d";
  return "180d";
}

/** Pairs the lenient wire schema with `normalizeHorizon` so the LLM
 *  client can: (1) hand the gateway a strict `json_schema` derived
 *  from the lenient shape (vendor-side conformance retry on capable
 *  providers), (2) Zod-validate the wire response, (3) coerce the
 *  free-form horizon string onto the canonical `RoadmapStep` enum
 *  before returning to the service. Single source for "what we accept
 *  on the wire vs. what the rest of the app sees". */
const Career360PlanIngest = defineLenientIngest({
  name: "Career360Plan",
  ingest: LenientPlanResponseSchema,
  coerce: (wire) => ({
    rubric: wire.rubric,
    gaps: wire.gaps,
    roadmap: wire.roadmap.map((step) => ({
      ...step,
      horizon: normalizeHorizon(step.horizon),
    })),
  }),
});

interface SeekerSnapshot {
  fullName: string;
  headline: string | null;
  summary: string | null;
  currentRole: string | null;
  currentCompany: string | null;
  yearsOfExperience: number | null;
  skills: string[];
  industries: string[];
  preferredRoles: string[];
  /** Pulled from the user's master resume content (`certificates[]`).
   *  Without this the LLM hallucinates "you should get certified in X"
   *  when the seeker already holds X — the original 2026-05-10 bug
   *  report on Career 360 was a PSPO-certified user being told to earn
   *  PSPO. Format: "Name (Issuer, YYYY)". */
  certifications: string[];
  /** Awards from the master resume — used the same way as certifications
   *  to prevent hallucinated "this isn't recognised" gap rows. */
  awards: string[];
  /** Highest education entries from the master resume — degree + field
   *  + institution. Truncated to the most recent 4 to keep the prompt
   *  bounded for free-tier models. */
  education: string[];
  /** Concatenated work history headline (Title @ Company, YYYY–YYYY).
   *  The full bullet text would blow the prompt budget; the title +
   *  company line is enough for the LLM to ground "have you done X?"
   *  reasoning. Truncated to the most recent 6 roles. */
  workHistory: string[];
}

// ── Public API ────────────────────────────────────────────────────────────────

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

/** Generate 3 candidate targets from the seeker's profile + resume +
 *  skills, persist them on the document so the picker stays warm
 *  across reloads, and return the suggestions. */
export async function suggestTargets(args: {
  userId: string;
  env: LLMEnv | undefined;
  user: JwtPayload | null | undefined;
}): Promise<TargetSuggestion[]> {
  const snapshot = await loadSeekerSnapshot(args.userId);

  const client = createLLMClient(args.env, args.user);
  const result = await client.callJson(
    "career_360_suggest",
    {
      useCase: "career_360",
      systemPrompt: SUGGEST_SYSTEM_PROMPT,
      userMessage: snapshotForPrompt(snapshot),
    },
    SuggestTargetsResponseSchema,
  );

  // Stamp ids deterministically so the picker can key off them. The
  // LLM sometimes returns the same `id` it saw last call — overwrite.
  const suggestions = result.data.suggestions.map((s, i) => ({
    ...s,
    id: `sug_${Date.now().toString(36)}_${i}`,
  }));

  const existing = (await loadDoc(args.userId)) ?? {};
  const next: CareerTargetDoc = {
    ...existing,
    suggested: suggestions,
    suggestedAt: new Date().toISOString(),
  };
  await persistDoc(args.userId, next);

  return suggestions;
}

/** Lock in a target — either by id from the cached suggestion list, or
 *  free-form custom — run the gap-analysis LLM call, persist the full
 *  plan document, and return it. */
export async function selectTarget(args: {
  userId: string;
  env: LLMEnv | undefined;
  user: JwtPayload | null | undefined;
  request: SelectTargetRequest;
}): Promise<SelectedTarget> {
  const { userId, env, user, request } = args;

  const existing = (await loadDoc(userId)) ?? {};

  let baseTarget: {
    id: string;
    title: string;
    seniority?: string;
    description: string;
    why: string;
    timelineMonths: number;
  };

  if (request.fromSuggestionId) {
    const fromList = (existing.suggested ?? []).find(
      (s) => s.id === request.fromSuggestionId,
    );
    if (!fromList) {
      throw new Error("SUGGESTION_NOT_FOUND");
    }
    baseTarget = fromList;
  } else if (request.custom) {
    baseTarget = {
      id: `custom_${Date.now().toString(36)}`,
      title: request.custom.title,
      seniority: request.custom.seniority,
      description: request.custom.description ?? request.custom.title,
      why: "Self-selected by the user.",
      timelineMonths: request.custom.timelineMonths ?? 12,
    };
  } else {
    throw new Error("INVALID_REQUEST");
  }

  const snapshot = await loadSeekerSnapshot(userId);
  const client = createLLMClient(env, user);
  const planMessage = `${snapshotForPrompt(snapshot)}

Target: ${baseTarget.title}${baseTarget.seniority ? ` (${baseTarget.seniority})` : ""}
Description: ${baseTarget.description}
Timeline: ${baseTarget.timelineMonths} months

Build the plan.`;

  // Lenient ingest: gateway gets a strict `json_schema` derived from
  // `LenientPlanResponseSchema` so capable providers do vendor-side
  // conformance retry; horizon drift on free-tier models is coerced
  // onto the legal bucket inside `Career360PlanIngest.coerce` before
  // we ever see it. See gaps #532–#534.
  const result = await client.callJsonLenient(
    "career_360_plan",
    {
      useCase: "career_360",
      systemPrompt: PLAN_SYSTEM_PROMPT,
      userMessage: planMessage,
    },
    Career360PlanIngest,
  );

  // Stamp ids deterministically so the frontend can key gaps without
  // worrying about LLM-returned id collisions across runs.
  const stamp = Date.now().toString(36);
  const gaps = result.data.gaps.map((g, i) => ({ ...g, id: `gap_${stamp}_${i}` }));
  const roadmap: RoadmapStep[] = result.data.roadmap.map((step, i) => {
    const remappedCloses = step.closesGapIds
      .map((rawId) => {
        // The LLM tends to reuse the gap ids from its own output; normalize
        // by index when possible so links survive our id rewrite above.
        const numeric = Number.parseInt(rawId.replace(/[^0-9]/g, ""), 10);
        if (Number.isFinite(numeric) && numeric >= 0 && numeric < gaps.length) {
          return gaps[numeric].id;
        }
        return null;
      })
      .filter((id): id is string => !!id);
    return {
      ...step,
      id: `step_${stamp}_${i}`,
      closesGapIds: remappedCloses,
    };
  });

  const selected: SelectedTarget = {
    id: baseTarget.id,
    title: baseTarget.title,
    seniority: baseTarget.seniority,
    description: baseTarget.description,
    why: baseTarget.why,
    timelineMonths: baseTarget.timelineMonths,
    chosenAt: existing.selected?.chosenAt ?? new Date().toISOString(),
    rubric: result.data.rubric,
    gaps,
    roadmap,
    lastRefreshedAt: new Date().toISOString(),
  };

  const next: CareerTargetDoc = {
    ...existing,
    selected,
  };
  await persistDoc(userId, next);

  return selected;
}

export async function clearTarget(userId: string): Promise<void> {
  const existing = (await loadDoc(userId)) ?? {};
  const { selected: _drop, ...rest } = existing;
  await persistDoc(userId, rest);
}

/** Re-score a single gap or roadmap step against the seeker's CURRENT
 *  full snapshot (including the master resume's certs / education /
 *  work). Returns a plain verdict the UI renders inline beneath the
 *  row so the seeker can confirm the LLM didn't miss something they
 *  already have. Doesn't mutate the saved doc — re-evaluation is
 *  read-only; the seeker decides whether to act on it. */
export async function evaluateItem(args: {
  userId: string;
  env: LLMEnv | undefined;
  user: JwtPayload | null | undefined;
  request: EvaluateRequest;
}): Promise<EvaluationResult> {
  const { userId, env, user, request } = args;
  const doc = await loadDoc(userId);
  const selected = doc?.selected;
  if (!selected) {
    throw new Error("NO_TARGET");
  }

  const item = resolveEvaluationItem(selected, request);
  const snapshot = await loadSeekerSnapshot(userId);
  const client = createLLMClient(env, user);

  const userMessage = `${snapshotForPrompt(snapshot)}

Active Career 360 target: ${selected.title}${selected.seniority ? ` (${selected.seniority})` : ""} on a ${selected.timelineMonths}-month horizon.

${item.prompt}`;

  const result = await client.callJson(
    "career_360_evaluate",
    {
      useCase: "career_360",
      systemPrompt: EVALUATE_SYSTEM_PROMPT,
      userMessage,
    },
    EvaluationResultSchema,
  );

  return result.data;
}

function resolveEvaluationItem(
  selected: SelectedTarget,
  request: EvaluateRequest,
): { kind: "gap" | "step"; prompt: string } {
  if ("gapId" in request) {
    const gap = selected.gaps.find((g) => g.id === request.gapId);
    if (!gap) throw new Error("ITEM_NOT_FOUND");
    return { kind: "gap", prompt: buildGapEvaluationPrompt(gap) };
  }
  const step = selected.roadmap.find((s) => s.id === request.roadmapStepId);
  if (!step) throw new Error("ITEM_NOT_FOUND");
  return { kind: "step", prompt: buildStepEvaluationPrompt(step) };
}

function buildGapEvaluationPrompt(gap: Gap): string {
  return `Re-evaluate THIS gap against the seeker's full snapshot above and decide if it's still real:

Gap label: ${gap.label}
Category: ${gap.category}
Severity (LLM previously assigned): ${gap.severity}
Current value (LLM-asserted): ${gap.currentValue}
Target value: ${gap.targetValue}
Suggested actions: ${gap.suggestedActions.join(" | ")}

Verdict scale:
  - "closed"    — the seeker already meets this; the gap is wrong (e.g. a cert recommended is in their certifications list).
  - "partial"   — they meet some of it but not all; explain what's missing.
  - "open"      — still a real, unmet gap.
  - "uncertain" — not enough signal in the snapshot to call it.`;
}

function buildStepEvaluationPrompt(step: RoadmapStep): string {
  return `Re-evaluate THIS roadmap step against the seeker's full snapshot above and decide if it's still worth doing:

Step title: ${step.title}
Horizon: ${step.horizon}
Detail: ${step.detail}

Verdict scale:
  - "closed"    — the step describes something the seeker has already done (e.g. "Earn PSPO" but PSPO is in their certifications list).
  - "partial"   — they've done part of it; explain what's left.
  - "open"      — still a worthwhile step they haven't completed.
  - "uncertain" — not enough signal in the snapshot to call it.`;
}

// ── Internals ────────────────────────────────────────────────────────────────

async function loadSeekerSnapshot(userId: string): Promise<SeekerSnapshot> {
  const db = getDb();

  const [account] = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!account) throw new Error("USER_NOT_FOUND");

  const [profile] = await db
    .select({
      headline: userProfiles.headline,
      summary: userProfiles.summary,
      currentRole: userProfiles.currentRole,
      currentCompany: userProfiles.currentCompany,
      yearsOfExperience: userProfiles.yearsOfExperience,
      skills: userProfiles.skills,
      industries: userProfiles.industries,
      preferredRoles: userProfiles.preferredRoles,
    })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);

  // Master resume → certifications/awards/education/work, the signals
  // the prompt was previously blind to. Without these the LLM can't
  // cross-check "do they already hold this cert?" and fabricates a
  // gap (production bug report 2026-05-10: PSPO-certified user told
  // to earn PSPO). Falls back to a fresh resume if no master flag is
  // set, since legacy accounts pre-date the master flag.
  const [resumeRow] = await db
    .select({ content: resumeInformation.content })
    .from(resumeInformation)
    .where(
      and(
        eq(resumeInformation.userId, userId),
        eq(resumeInformation.isMaster, true),
      ),
    )
    .orderBy(desc(resumeInformation.updatedAt))
    .limit(1);

  const fallbackResume = resumeRow
    ? null
    : (await db
        .select({ content: resumeInformation.content })
        .from(resumeInformation)
        .where(eq(resumeInformation.userId, userId))
        .orderBy(desc(resumeInformation.updatedAt))
        .limit(1))[0] ?? null;

  const resumeContent = parseResumeContent(resumeRow?.content ?? fallbackResume?.content);

  return {
    fullName: account.name ?? "",
    headline: profile?.headline ?? null,
    summary: profile?.summary ?? null,
    currentRole: profile?.currentRole ?? null,
    currentCompany: profile?.currentCompany ?? null,
    yearsOfExperience: profile?.yearsOfExperience ?? null,
    skills: Array.isArray(profile?.skills) ? (profile!.skills as string[]) : [],
    industries: Array.isArray(profile?.industries) ? (profile!.industries as string[]) : [],
    preferredRoles: Array.isArray(profile?.preferredRoles)
      ? (profile!.preferredRoles as string[])
      : [],
    certifications: resumeContent.certifications,
    awards: resumeContent.awards,
    education: resumeContent.education,
    workHistory: resumeContent.workHistory,
  };
}

/** Extract the four resume-derived fields the snapshot needs. The
 *  resume row's `content` is jsonb; if it doesn't parse against the
 *  shared `ResumeContentSchema` (legacy, partial, or corrupted) we
 *  treat each field as empty rather than crashing the whole flow. */
function parseResumeContent(raw: unknown): {
  certifications: string[];
  awards: string[];
  education: string[];
  workHistory: string[];
} {
  if (!raw || typeof raw !== "object") {
    return { certifications: [], awards: [], education: [], workHistory: [] };
  }
  const parsed = ResumeContentSchema.safeParse(raw);
  if (!parsed.success) {
    return { certifications: [], awards: [], education: [], workHistory: [] };
  }
  const c = parsed.data;
  return {
    certifications: c.certificates
      .filter((cert) => cert.name?.trim())
      .map((cert) => {
        const parts = [cert.name];
        if (cert.issuer) parts.push(`(${cert.issuer}${cert.date ? `, ${cert.date}` : ""})`);
        else if (cert.date) parts.push(`(${cert.date})`);
        return parts.join(" ");
      }),
    awards: c.awards
      .filter((a) => a.title?.trim())
      .map((a) => {
        const parts = [a.title];
        if (a.awarder) parts.push(`— ${a.awarder}`);
        if (a.date) parts.push(`(${a.date})`);
        return parts.join(" ");
      }),
    // Most-recent 4 entries — by `endDate` desc with a fallback to
    // `startDate`. Resumes typically list newest-first already, so a
    // simple slice catches the common case without parsing dates.
    education: c.education
      .slice(0, 4)
      .filter((e) => e.studyType || e.area || e.institution)
      .map((e) => {
        const study = [e.studyType, e.area].filter(Boolean).join(" in ");
        const inst = e.institution ? ` — ${e.institution}` : "";
        return `${study || "Studied"}${inst}`;
      }),
    workHistory: c.work
      .slice(0, 6)
      .filter((w) => w.position || w.name)
      .map((w) => {
        const role = w.position || "Role";
        const company = w.name ? ` @ ${w.name}` : "";
        const start = w.startDate || "";
        const end = w.endDate || "Present";
        const dates = start || end ? ` (${start || "?"}–${end})` : "";
        return `${role}${company}${dates}`;
      }),
  };
}

function snapshotForPrompt(s: SeekerSnapshot): string {
  const lines = [
    `Name: ${s.fullName || "(unknown)"}`,
    `Current role: ${s.currentRole ?? "(not set)"}${s.currentCompany ? ` at ${s.currentCompany}` : ""}`,
    `Headline: ${s.headline ?? "(not set)"}`,
    `Summary: ${s.summary ?? "(not set)"}`,
    `Years of experience: ${s.yearsOfExperience ?? "(not set)"}`,
    `Skills: ${s.skills.length ? s.skills.join(", ") : "(none listed)"}`,
    `Industries: ${s.industries.length ? s.industries.join(", ") : "(none listed)"}`,
    `Preferred roles: ${s.preferredRoles.length ? s.preferredRoles.join(", ") : "(none listed)"}`,
    `Certifications held: ${s.certifications.length ? s.certifications.join("; ") : "(none on file)"}`,
    `Awards: ${s.awards.length ? s.awards.join("; ") : "(none on file)"}`,
    `Education: ${s.education.length ? s.education.join("; ") : "(none on file)"}`,
    `Work history (most recent first): ${s.workHistory.length ? s.workHistory.join(" | ") : "(none on file)"}`,
  ];
  return lines.join("\n");
}

async function loadDoc(userId: string): Promise<CareerTargetDoc | null> {
  const db = getDb();
  const [row] = await db
    .select({ doc: userProfiles.careerTarget })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);
  if (!row?.doc) return null;
  const parsed = CareerTargetDocSchema.safeParse(row.doc);
  if (!parsed.success) return null;
  return parsed.data;
}

async function persistDoc(userId: string, doc: CareerTargetDoc): Promise<void> {
  const db = getDb();
  // user_profiles row is created at signup, but if for any reason it
  // isn't there (legacy accounts), upsert lazily so the route stays
  // functional rather than throwing on a missing row.
  const [existing] = await db
    .select({ id: userProfiles.id })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);
  // Drizzle's `$inferInsert` for `user_profiles` resolves down to
  // `{ userId: string }` due to the table's width — same gap that
  // forces `repositories/usersRepository.ts::upsertProfile` to cast
  // its input. Concentrate the workaround in one local helper rather
  // than scattering `as any` through the call sites.
  const patch = asInsertPatch({ careerTarget: doc, updatedAt: new Date() });
  if (existing) {
    await db.update(userProfiles).set(patch).where(eq(userProfiles.userId, userId));
  } else {
    await db.insert(userProfiles).values({ userId, ...patch });
  }
}

function asInsertPatch(
  value: { careerTarget: CareerTargetDoc; updatedAt: Date },
): Record<string, unknown> {
  return value as unknown as Record<string, unknown>;
}

async function loadScoreHistory(userId: string): Promise<ScoreHistorySeries[]> {
  const db = getDb();
  const rows = await db
    .select({
      toolId: toolRuns.toolId,
      score: toolRuns.score,
      createdAt: toolRuns.createdAt,
    })
    .from(toolRuns)
    .where(
      and(
        eq(toolRuns.userId, userId),
        isNotNull(toolRuns.score),
        inArray(toolRuns.toolId, SCORED_TOOL_IDS as readonly string[] as string[]),
      ),
    )
    .orderBy(desc(toolRuns.createdAt))
    .limit(120);

  const grouped = new Map<string, { recordedAt: string; score: number }[]>();
  for (const row of rows) {
    if (row.score == null) continue;
    const numericScore =
      typeof row.score === "string" ? Number.parseFloat(row.score) : Number(row.score);
    if (!Number.isFinite(numericScore)) continue;
    const series = grouped.get(row.toolId) ?? [];
    series.push({
      recordedAt: (row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt)),
      score: clampScore(numericScore),
    });
    grouped.set(row.toolId, series);
  }

  return Array.from(grouped.entries()).map(([toolId, points]) => ({
    toolId,
    label:
      TOOL_LABELS[toolId as keyof typeof TOOL_LABELS] ?? toolId,
    // DB returned newest-first; sparkline reads chronological L→R.
    points: points
      .slice()
      .reverse()
      .map((p) => ({ toolId, recordedAt: p.recordedAt, score: p.score })),
  }));
}

function clampScore(n: number): number {
  if (n > 100) return 100;
  if (n < 0) return 0;
  return Math.round(n);
}

// ── Inner-ring outcomes (#421) ───────────────────────────────────────────────
//
// The wheel's inner ring tracks OUTCOMES (did applications convert?),
// distinct from the outer ring's readiness gaps. We derive them from the
// seeker's own funnel tracker — the `saved_jobs` pipeline — which is the
// only table that models the full applied → interviewing → offered →
// accepted lifecycle for a given user (`job_applications` is a flat
// apply-record with no terminal outcome; `placements` is recruiter-side,
// not the seeker's offers). Goal-fit is read straight off the active
// target's gap severities. Until a user has enough applications the
// signal stays "unknown" so a sample of one can't paint the ring.

/** Below this many real applications, callback / offer rates are noise. */
const MIN_APPLIED_FOR_SIGNAL = 3;
/** Below this many reached-interview rows, conversion is noise. */
const MIN_INTERVIEWS_FOR_SIGNAL = 2;
/** Band cut-offs per signal (numerator/denominator → good ≥ / moderate ≥,
 *  else poor). Loose industry benchmarks; centralised so tuning is one
 *  edit. */
const CALLBACK_THRESHOLDS = { good: 0.3, moderate: 0.12 } as const;
const INTERVIEW_THRESHOLDS = { good: 0.4, moderate: 0.15 } as const;
const OFFER_THRESHOLDS = { good: 0.12, moderate: 0.04 } as const;
/** Goal-fit is a 0..1 score (1 = no gaps); these are its band cut-offs. */
const GOALFIT_THRESHOLDS = { good: 0.7, moderate: 0.34 } as const;
/** Funnel aggregate TTL. Short because `saved_jobs` status changes live
 *  in the jobs domain and don't invalidate this key (see register #421
 *  follow-up); 2 minutes bounds staleness without re-querying per load. */
const OUTCOMES_CACHE_TTL_SECONDS = 120;

export interface FunnelCounts {
  /** Rows that represent a real submitted application (excludes "tracked"
   *  = saved-not-applied and "cancelled" = job pulled). */
  applied: number;
  /** Rows that reached the interview stage or beyond. */
  interviewed: number;
  /** Rows that produced an offer (offered / accepted / declined-by-user). */
  offered: number;
}

/** Read-through cached funnel aggregate. One `GROUP BY status` query per
 *  miss — never per-status fan-out. */
async function loadFunnelCounts(userId: string): Promise<FunnelCounts> {
  return getOrSetCached<FunnelCounts>({
    key: `c360:funnel:${userId}`,
    ttlSeconds: OUTCOMES_CACHE_TTL_SECONDS,
    loader: () => computeFunnelCounts(userId),
  });
}

async function computeFunnelCounts(userId: string): Promise<FunnelCounts> {
  const db = getDb();
  const rows = await db
    .select({ status: savedJobs.status, n: sql<number>`count(*)::int` })
    .from(savedJobs)
    .where(eq(savedJobs.userId, userId))
    .groupBy(savedJobs.status);

  const byStatus = new Map<string, number>();
  for (const row of rows) byStatus.set(row.status, Number(row.n) || 0);
  const n = (status: string) => byStatus.get(status) ?? 0;

  const interviewed = n("interviewing") + n("offered") + n("accepted") + n("declined");
  const offered = n("offered") + n("accepted") + n("declined");
  // `rejected` / `withdrawn` were applied to but never reached interview;
  // they count toward the denominator only.
  const applied = interviewed + n("applied") + n("rejected") + n("withdrawn");
  return { applied, interviewed, offered };
}

/** Build the four inner-ring outcomes. Pure — goal-fit reads the freshly
 *  loaded `doc` (so selecting/refreshing a target updates it without
 *  touching the funnel cache); the three funnel signals read `counts`.
 *  Exported for unit coverage of the banding/floor math. */
export function computeOutcomes(counts: FunnelCounts, doc: CareerTargetDoc | null): Career360Outcomes {
  return [
    funnelSignal(
      "callback-rate",
      counts.interviewed,
      counts.applied,
      CALLBACK_THRESHOLDS,
      MIN_APPLIED_FOR_SIGNAL,
    ),
    funnelSignal(
      "interview-conversion",
      counts.offered,
      counts.interviewed,
      INTERVIEW_THRESHOLDS,
      MIN_INTERVIEWS_FOR_SIGNAL,
    ),
    funnelSignal(
      "offer-rate",
      counts.offered,
      counts.applied,
      OFFER_THRESHOLDS,
      MIN_APPLIED_FOR_SIGNAL,
    ),
    goalFitSignal(doc),
  ];
}

function funnelSignal(
  id: OutcomeSegmentId,
  numerator: number,
  denominator: number,
  thresholds: { good: number; moderate: number },
  minDenominator: number,
): OutcomeSignal {
  if (denominator < minDenominator) {
    return { id, health: "unknown", rate: null, sampleSize: denominator };
  }
  const rate = denominator > 0 ? numerator / denominator : 0;
  const health =
    rate >= thresholds.good ? "good" : rate >= thresholds.moderate ? "moderate" : "poor";
  return { id, health, rate, sampleSize: denominator };
}

/** Goal-fit blends the active target's gap severities into a single 0..1
 *  fit score (1 = no high-severity gaps). No active target / no gaps →
 *  "unknown". */
function goalFitSignal(doc: CareerTargetDoc | null): OutcomeSignal {
  const gaps = doc?.selected?.gaps ?? [];
  if (!doc?.selected || gaps.length === 0) {
    return { id: "goal-fit", health: "unknown", rate: null, sampleSize: gaps.length };
  }
  const weight = { low: 0, medium: 1, high: 2 } as const;
  const meanSeverity =
    gaps.reduce((sum, g) => sum + weight[g.severity], 0) / gaps.length;
  // Invert: more/severe gaps → lower fit. meanSeverity ∈ [0,2] → fit ∈ [0,1].
  const fit = 1 - meanSeverity / 2;
  const health =
    fit >= GOALFIT_THRESHOLDS.good ? "good"
    : fit >= GOALFIT_THRESHOLDS.moderate ? "moderate"
    : "poor";
  return { id: "goal-fit", health, rate: fit, sampleSize: gaps.length };
}

// ── Prompts ──────────────────────────────────────────────────────────────────

const SUGGEST_SYSTEM_PROMPT = `You are an expert career strategist proposing realistic next-role targets for a job seeker based on their current profile.

Output exactly 3 distinct targets that span a useful range:
  - one "next-step" target — a believable promotion / lateral that they could land in 6–12 months,
  - one "stretch" target — a meaningful jump that fits their trajectory but takes 12–24 months,
  - one "pivot" target — an adjacent direction the user might not have considered, grounded in their existing skills.

Hard rules:
  - Never invent skills, employers, or experience the user didn't supply. Read the profile carefully and ground every suggestion in what's actually there.
  - "title" is concrete: "Staff Backend Engineer" not "Senior Engineer". "seniority" is one of "IC", "Senior", "Staff", "Principal", "Lead", "Manager", "Director", "VP" — omit when the title already implies it.
  - "description" is two short sentences explaining what the role does day-to-day.
  - "why" is one sentence explicitly tying the suggestion back to a SIGNAL in their profile (a skill, a past company, an industry). Quote the signal.
  - "timelineMonths" reflects the gap between current state and target — be honest, not aspirational.

Return ONLY a JSON object:
{ "suggestions": [ { "id": "<placeholder>", "title": "...", "seniority": "...", "description": "...", "why": "...", "timelineMonths": <integer> }, ... ] }`;

const PLAN_SYSTEM_PROMPT = `You are an expert career strategist building the plan for a job seeker who has chosen a target role.

Given the seeker's current profile and the chosen target, produce three things:

1. **rubric** — what this target role typically requires:
   - mustHaveSkills: 5–10 concrete skills (technologies, capabilities — not soft adjectives).
   - niceToHaveSkills: 3–8 differentiating skills.
   - expectedYearsExperience: a single string ("4-6 years", "8+ years").
   - expectedCertifications: well-known certs that materially help (AWS SA, PMP, CFA, …) or [].
   - narrativeHook: one sentence describing how candidates pitch themselves into this role.

2. **gaps** — 5–10 specific gaps between the seeker and the rubric:
   - id: leave any placeholder string (server rewrites).
   - category: one of "profile" | "resume" | "skills" | "experience" | "certifications" | "narrative" | "outreach" | "salary".
   - severity: "low" | "medium" | "high" — high means the seeker can't pass the bar without closing it.
   - label: short, concrete ("No AWS Solutions Architect cert").
   - currentValue: one sentence on what they have today.
   - targetValue: one sentence on what the target role expects.
   - suggestedActions: 1–3 imperative bullets — verbs first ("Take the AWS SA Associate exam in the next 90 days").
   - toolId: a SINGLE string — pick the one tool id that most directly closes this gap, or omit the field entirely. NEVER return an array. Valid ids: "resume-optimizer" (resume gaps), "profile-audit" (profile gaps), "skill-extractor" (skill discovery), "ai-resume-scorer" (ATS / overall resume), "value-proposition" (narrative), "salary-calculator" (salary), "resume-tailor" (job-specific resume), "sentiment-analysis" (resume tone), "interview-coach" (interview prep).

3. **roadmap** — 4–8 ordered steps. Each step is an object with these fields:
   - id: leave any placeholder string (server rewrites).
   - horizon: must be EXACTLY one of these four lowercase tokens — "30d" | "60d" | "90d" | "180d". This is a hard constraint and applies to EVERY step including the later ones. Do NOT emit "1m", "2m", "3m", "6m", "1y", "4w", "8w", "12w", "30 days", "60 days", "3 months", "six months", "Q1", "short-term", "long-term", or numbers. If a step would naturally be 6 months out, label it "180d". If it would be 4 months out, also label it "180d". If it would be 45 days out, label it "60d". There is no fifth bucket — pick the closest of the four. Steps later in the roadmap MUST still pick from the same four tokens; do not let the horizon drift to longer freeform values just because the step is further out.
   - title: imperative ("Earn AWS Solutions Architect Associate").
   - detail: one or two sentences on what doing the step looks like.
   - closesGapIds: an array of strings — the indices of gaps from the gaps array that this step closes ("0", "1", …).

Worked example (illustrating the horizon constraint — DO NOT copy the content):
{
  "rubric": { "mustHaveSkills": [...], "niceToHaveSkills": [...], "expectedYearsExperience": "5-7 years", "expectedCertifications": [], "narrativeHook": "..." },
  "gaps": [ { ... } ],
  "roadmap": [
    { "id": "s0", "horizon": "30d",  "title": "Refactor LinkedIn headline", ... },
    { "id": "s1", "horizon": "60d",  "title": "Ship a public side project", ... },
    { "id": "s2", "horizon": "90d",  "title": "Pass AWS Cloud Practitioner", ... },
    { "id": "s3", "horizon": "180d", "title": "Earn AWS Solutions Architect Associate", ... }
  ]
}

Hard rules:
  - Never invent facts about the seeker or about the target role.
  - The seeker's snapshot includes "Certifications held" and "Awards" — DO NOT recommend earning a credential that already appears there. If they hold the Certified Scrum Product Owner (PSPO), the rubric must list it under "alreadyHas" rather than as a missing cert. Cross-check the same way for AWS / PMP / CFA / Google / Azure / etc.
  - Same rule for skills, education, and work history — if it's already on the snapshot, treat it as present and do not raise a gap that says they lack it.
  - Order roadmap by horizon ascending, then by leverage × ease.
  - Every gap with severity "high" MUST be referenced by at least one roadmap step.
  - Output ONLY a JSON object: { "rubric": {...}, "gaps": [...], "roadmap": [...] }.`;

const EVALUATE_SYSTEM_PROMPT = `You are a careful career strategist re-checking a single previously-flagged gap or roadmap step against a job seeker's full snapshot.

You will receive:
  - The seeker's snapshot (profile, skills, certifications, awards, education, work history).
  - The currently-active Career 360 target.
  - One specific item to re-evaluate (either a gap or a roadmap step), with the prior LLM's rationale.

Your job: judge whether that item is still real today, given everything in the snapshot.

Hard rules:
  - Quote evidence from the snapshot when you flip a verdict to "closed" or "partial". A bare "they have it" is not enough — name the cert / role / skill.
  - If the item recommends a credential the seeker already holds (cross-check the "Certifications held" line, including common short forms: PSPO ↔ Certified Scrum Product Owner, PMP ↔ Project Management Professional, AWS SA ↔ AWS Solutions Architect, CFA ↔ Chartered Financial Analyst), the verdict MUST be "closed".
  - "uncertain" is reserved for genuinely missing signal — DO NOT use it as a hedge when "open" or "closed" is supportable.
  - Keep "explanation" to one short paragraph — the seeker is reading this on a row in a table.

Return ONLY a JSON object:
{ "verdict": "closed" | "partial" | "open" | "uncertain", "explanation": "...", "evidence": ["..."] }`;

