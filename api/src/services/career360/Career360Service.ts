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

import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { createLLMClient } from "../adapters/llm-client.js";
import { recordTokenUsage } from "../billing/BillingService.js";
import {
  CareerTargetDocSchema,
  SuggestTargetsResponseSchema,
  TargetPlanResponseSchema,
  type CareerTargetDoc,
  type Career360StateResponse,
  type ScoreHistorySeries,
  type SelectedTarget,
  type SelectTargetRequest,
  type TargetSuggestion,
} from "../../../../shared/career360-types.js";
import type { JwtPayload } from "../../types/index.js";
import type { ProviderEnv } from "../adapters/providers.js";

const { users, userProfiles, toolRuns } = schema;

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
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getCareer360State(userId: string): Promise<Career360StateResponse> {
  const doc = await loadDoc(userId);
  const history = await loadScoreHistory(userId);
  return { doc, history };
}

/** Generate 3 candidate targets from the seeker's profile + resume +
 *  skills, persist them on the document so the picker stays warm
 *  across reloads, and return the suggestions. */
export async function suggestTargets(args: {
  userId: string;
  env: ProviderEnv | undefined;
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
  env: ProviderEnv | undefined;
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

  const result = await client.callJson(
    "career_360_plan",
    {
      useCase: "career_360",
      systemPrompt: PLAN_SYSTEM_PROMPT,
      userMessage: planMessage,
    },
    TargetPlanResponseSchema,
  );

  // Stamp ids deterministically so the frontend can key gaps without
  // worrying about LLM-returned id collisions across runs.
  const stamp = Date.now().toString(36);
  const gaps = result.data.gaps.map((g, i) => ({ ...g, id: `gap_${stamp}_${i}` }));
  const roadmap = result.data.roadmap.map((step, i) => {
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
    return { ...step, id: `step_${stamp}_${i}`, closesGapIds: remappedCloses };
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
   - toolId: when one of these existing tools closes the gap most directly, pick its id; otherwise omit. Valid ids: "resume-optimizer" (resume gaps), "profile-audit" (profile gaps), "skill-extractor" (skill discovery), "ai-resume-scorer" (ATS / overall resume), "value-proposition" (narrative), "salary-calculator" (salary), "resume-tailor" (job-specific resume), "sentiment-analysis" (resume tone), "interview-coach" (interview prep).

3. **roadmap** — 4–8 ordered steps grouped by horizon ("30d" | "60d" | "90d" | "180d"):
   - title: imperative ("Earn AWS Solutions Architect Associate").
   - detail: one or two sentences on what doing the step looks like.
   - closesGapIds: the indices (as strings, "0", "1", …) of the gaps from the gaps array that this step closes.

Hard rules:
  - Never invent facts about the seeker or about the target role.
  - Order roadmap by horizon ascending, then by leverage × ease.
  - Every gap with severity "high" MUST be referenced by at least one roadmap step.
  - Output ONLY a JSON object: { "rubric": {...}, "gaps": [...], "roadmap": [...] }.`;

