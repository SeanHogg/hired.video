// Career 360 shared shapes. Single source of truth for the document
// stored in `user_profiles.career_target` and the JSON the frontend
// renders. Mirror schema between LLM output and DB so the gap/roadmap
// payload doesn't need re-shaping at the route boundary.

import { z } from "zod";

/** A single career target proposed (or chosen) for the seeker. */
export const TargetSuggestionSchema = z.object({
  /** Stable id for the suggestion — used by the picker UI to key
   *  selection without committing to a server-side row. Defaulted on
   *  inbound: the server rewrites suggestion ids deterministically
   *  before persisting, so a missing/blank id from the LLM is fine —
   *  schema requiring it just rejects valid output. Persisted shape
   *  always carries a real id. */
  id: z.string().default(""),
  title: z.string().min(1).max(160),
  /** Optional seniority hint ("Senior", "Staff", "Director", …). */
  seniority: z.string().max(80).optional(),
  /** Two-line, candidate-facing description of the role. */
  description: z.string().min(1).max(600),
  /** Why this target fits the seeker's profile, in their words. */
  why: z.string().min(1).max(600),
  /** Realistic timeline in months from "today" to "ready to apply". */
  timelineMonths: z.number().int().min(1).max(60),
});
export type TargetSuggestion = z.infer<typeof TargetSuggestionSchema>;

export const SuggestTargetsResponseSchema = z.object({
  suggestions: z.array(TargetSuggestionSchema).min(1).max(5),
});
export type SuggestTargetsResponse = z.infer<typeof SuggestTargetsResponseSchema>;

export type GapSeverity = "low" | "medium" | "high";
export type GapCategory =
  | "profile"
  | "resume"
  | "skills"
  | "experience"
  | "certifications"
  | "narrative"
  | "outreach"
  | "salary";

export const GapSchema = z.object({
  // Server-stamped on inbound; see Career360Service.selectTarget.
  // Defaulted to "" so a missing id from the LLM doesn't reject the
  // whole response; persisted shape always carries a real id.
  id: z.string().default(""),
  category: z.enum([
    "profile",
    "resume",
    "skills",
    "experience",
    "certifications",
    "narrative",
    "outreach",
    "salary",
  ]),
  severity: z.enum(["low", "medium", "high"]),
  /** Short user-facing label — "No AWS Solutions Architect cert". */
  label: z.string().min(1).max(160),
  /** What the seeker has now (one line). */
  currentValue: z.string().max(320),
  /** What the target needs (one line). */
  targetValue: z.string().max(320),
  /** 1–3 concrete actions to close this gap. */
  suggestedActions: z.array(z.string().min(1).max(280)).min(1).max(3),
  /** Tool id from `frontend/data/tools-catalog.ts` whose page closes
   *  this gap most directly. Empty when no tool maps cleanly. Some
   *  LLMs return an array of tool ids despite the prompt asking for
   *  one — coerce to the first element rather than rejecting the
   *  whole response. */
  toolId: z.preprocess(
    (v) => (Array.isArray(v) ? v[0] : v),
    z.string().max(80).optional(),
  ),
});
export type Gap = z.infer<typeof GapSchema>;

export const RoadmapStepSchema = z.object({
  // Server-stamped on inbound; see Career360Service.selectTarget.
  // Defaulted to "" so a missing id from the LLM doesn't reject the
  // whole response; persisted shape always carries a real id.
  id: z.string().default(""),
  /** "30d" / "60d" / "90d" / "180d" — milestone bucket for the step. */
  horizon: z.enum(["30d", "60d", "90d", "180d"]),
  title: z.string().min(1).max(200),
  detail: z.string().max(600),
  /** Gap ids this step closes (refers back to Gap.id). */
  closesGapIds: z.array(z.string()).default([]),
});
export type RoadmapStep = z.infer<typeof RoadmapStepSchema>;

export const TargetRubricSchema = z.object({
  /** Free-form bullet list of must-have skills for the role. */
  mustHaveSkills: z.array(z.string()).default([]),
  /** Free-form bullet list of nice-to-have skills. */
  niceToHaveSkills: z.array(z.string()).default([]),
  /** Typical years of experience expected for the seniority. */
  expectedYearsExperience: z.string().max(40).optional(),
  /** Common certifications for this role, if any. */
  expectedCertifications: z.array(z.string()).default([]),
  /** Typical narrative hook — how candidates pitch themselves into this
   *  role. Drives the AI Coach prompts later. */
  narrativeHook: z.string().max(600).optional(),
});
export type TargetRubric = z.infer<typeof TargetRubricSchema>;

export const SelectedTargetSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  seniority: z.string().optional(),
  description: z.string(),
  why: z.string(),
  timelineMonths: z.number().int().min(1).max(60),
  chosenAt: z.string(),
  rubric: TargetRubricSchema,
  gaps: z.array(GapSchema),
  roadmap: z.array(RoadmapStepSchema),
  lastRefreshedAt: z.string(),
});
export type SelectedTarget = z.infer<typeof SelectedTargetSchema>;

export const CareerTargetDocSchema = z.object({
  suggested: z.array(TargetSuggestionSchema).optional(),
  suggestedAt: z.string().optional(),
  selected: SelectedTargetSchema.optional(),
});
export type CareerTargetDoc = z.infer<typeof CareerTargetDocSchema>;

export const SelectTargetRequestSchema = z.object({
  /** Either pick from `suggested` by id (cheap path) or supply a fresh
   *  target the user typed in themselves. */
  fromSuggestionId: z.string().min(1).optional(),
  custom: z
    .object({
      title: z.string().min(1).max(160),
      seniority: z.string().max(80).optional(),
      description: z.string().max(600).optional(),
      timelineMonths: z.number().int().min(1).max(60).optional(),
    })
    .optional(),
});
export type SelectTargetRequest = z.infer<typeof SelectTargetRequestSchema>;

export const TargetPlanResponseSchema = z.object({
  rubric: TargetRubricSchema,
  gaps: z.array(GapSchema).min(1).max(20),
  roadmap: z.array(RoadmapStepSchema).min(1).max(20),
});
export type TargetPlanResponse = z.infer<typeof TargetPlanResponseSchema>;

/** A point on the per-signal sparkline shown under the wheel. One dot
 *  per recorded run of the underlying tool (resume-scorer, profile-
 *  audit, etc.). */
export interface ScoreHistoryPoint {
  toolId: string;
  /** ISO timestamp the score was recorded. */
  recordedAt: string;
  /** 0–100, normalized. */
  score: number;
}

export interface ScoreHistorySeries {
  /** Catalog id from `tools-catalog.ts` so the frontend can label and
   *  deep-link to the originating tool. */
  toolId: string;
  /** Friendly label for the series — falls back to toolId when the
   *  catalog entry can't be resolved. */
  label: string;
  points: ScoreHistoryPoint[];
}

export interface Career360StateResponse {
  doc: CareerTargetDoc | null;
  history: ScoreHistorySeries[];
}

// ── Per-item re-evaluation ───────────────────────────────────────────────────

/** Verdict the LLM returns when re-evaluating a single gap or roadmap
 *  step against the seeker's current full profile + master resume. */
export type EvaluationVerdict =
  | "closed"          // The seeker has already met / completed this — drop it.
  | "partial"         // Some evidence but not enough to pass the bar.
  | "open"            // Still a real gap / step worth doing.
  | "uncertain";      // Not enough signal in the seeker data to judge.

export const EvaluationResultSchema = z.object({
  verdict: z.enum(["closed", "partial", "open", "uncertain"]),
  /** One-paragraph plain-English explanation grounded in the seeker's
   *  data — quotes the specific cert / role / skill that flipped (or
   *  failed to flip) the verdict. */
  explanation: z.string().min(1).max(800),
  /** Concrete evidence pulled from the seeker snapshot. Empty when the
   *  verdict is `open` or `uncertain`. */
  evidence: z.array(z.string().min(1).max(280)).max(8).default([]),
});
export type EvaluationResult = z.infer<typeof EvaluationResultSchema>;

export const EvaluateRequestSchema = z.union([
  z.object({ gapId: z.string().min(1) }),
  z.object({ roadmapStepId: z.string().min(1) }),
]);
export type EvaluateRequest = z.infer<typeof EvaluateRequestSchema>;
