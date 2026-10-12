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

// #527 — LLMs occasionally case-mangle the category ("Profile" instead
// of "profile") or use a synonym ("certs" instead of "certifications").
// Snap to the canonical 8-value enum BEFORE the zod check so the whole
// plan response doesn't get rejected on a cosmetic case mismatch. Any
// value that doesn't normalize cleanly falls through and the enum check
// rejects it as before.
const CATEGORY_CANONICAL = new Set([
  "profile",
  "resume",
  "skills",
  "experience",
  "certifications",
  "narrative",
  "outreach",
  "salary",
]);
const CATEGORY_SYNONYMS: Record<string, string> = {
  cert: "certifications",
  certs: "certifications",
  certification: "certifications",
  cv: "resume",
  cv_resume: "resume",
  resumes: "resume",
  resume_quality: "resume",
  skill: "skills",
  technical_skills: "skills",
  story: "narrative",
  positioning: "narrative",
  branding: "narrative",
  personal_branding: "narrative",
  network: "outreach",
  networking: "outreach",
  outbound: "outreach",
  applications: "outreach",
  compensation: "salary",
  pay: "salary",
  comp: "salary",
  bio: "profile",
  profile_quality: "profile",
  social_proof: "profile",
  work_experience: "experience",
  yoe: "experience",
};
/** #527 — Substring fallback bucket. When the LLM invents a brand-new
 *  category name we can't fully synonym-map, we still try to recover by
 *  matching a token from the offending value against a canonical key.
 *  Picks the FIRST canonical match in the substring order below so the
 *  result is deterministic. */
const CATEGORY_SUBSTRING_FALLBACK: Array<{ token: string; canonical: string }> = [
  { token: "resume", canonical: "resume" },
  { token: "cv", canonical: "resume" },
  { token: "skill", canonical: "skills" },
  { token: "experience", canonical: "experience" },
  { token: "cert", canonical: "certifications" },
  { token: "salary", canonical: "salary" },
  { token: "compensation", canonical: "salary" },
  { token: "outreach", canonical: "outreach" },
  { token: "network", canonical: "outreach" },
  { token: "narrative", canonical: "narrative" },
  { token: "story", canonical: "narrative" },
  { token: "brand", canonical: "narrative" },
  { token: "profile", canonical: "profile" },
  { token: "linkedin", canonical: "profile" },
  { token: "bio", canonical: "profile" },
];
function normalizeGapCategory(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const lower = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (CATEGORY_CANONICAL.has(lower)) return lower;
  const synonym = CATEGORY_SYNONYMS[lower];
  if (synonym) return synonym;
  // #527 — Last-resort substring match for inventive LLM output. The
  // alternative (Zod throws → whole roadmap response rejected → user
  // sees a 502 toast after retries) is worse than picking a sensible
  // bucket. Logs the unmapped value so SuperAdmin can spot patterns.
  for (const fallback of CATEGORY_SUBSTRING_FALLBACK) {
    if (lower.includes(fallback.token)) {
      if (typeof console !== "undefined" && typeof console.warn === "function") {
        console.warn(`[career360] gap category "${value}" → "${fallback.canonical}" via substring fallback`);
      }
      return fallback.canonical;
    }
  }
  // Final fallback — default to "narrative" so the response validates.
  // Narrative is the broadest non-technical bucket; a misclassified
  // gap there is the least misleading default.
  if (typeof console !== "undefined" && typeof console.warn === "function") {
    console.warn(`[career360] gap category "${value}" unmappable; defaulting to "narrative"`);
  }
  return "narrative";
}

export const GapSchema = z.object({
  // Server-stamped on inbound; see Career360Service.selectTarget.
  // Defaulted to "" so a missing id from the LLM doesn't reject the
  // whole response; persisted shape always carries a real id.
  id: z.string().default(""),
  category: z.preprocess(normalizeGapCategory, z.enum([
    "profile",
    "resume",
    "skills",
    "experience",
    "certifications",
    "narrative",
    "outreach",
    "salary",
  ])),
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

/** A gap or roadmap step the seeker has marked as resolved / done —
 *  either because a re-evaluation flipped it to "closed" or because they
 *  know they've already handled it. Resolved items stay in the plan (so
 *  the history is auditable) but drop out of the active gap counts,
 *  goal-fit signal, and the wheel's outer ring. `verdict` records the
 *  re-evaluation that prompted the resolve, when there was one. */
export const ResolvedItemSchema = z.object({
  /** Refers to a Gap.id or RoadmapStep.id in the same SelectedTarget. */
  itemId: z.string().min(1),
  kind: z.enum(["gap", "step"]),
  /** The re-evaluation verdict at the time of resolving, if any. */
  verdict: z.enum(["closed", "partial", "open", "uncertain"]).optional(),
  resolvedAt: z.string(),
});
export type ResolvedItem = z.infer<typeof ResolvedItemSchema>;

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
  /** Gaps / steps the seeker has marked done. Defaulted so docs persisted
   *  before this field parse cleanly as "nothing resolved yet". */
  resolvedItems: z.array(ResolvedItemSchema).default([]),
});
export type SelectedTarget = z.infer<typeof SelectedTargetSchema>;

/** True when the given gap/step id is in the target's resolved set. Pure
 *  helper shared by the wheel-health rollup, the roadmap rows, and the
 *  resume-view card so "is this done?" is decided in exactly one place. */
export function isCareerItemResolved(
  target: Pick<SelectedTarget, "resolvedItems">,
  kind: "gap" | "step",
  itemId: string,
): boolean {
  return (target.resolvedItems ?? []).some(
    (r) => r.kind === kind && r.itemId === itemId,
  );
}

/** The subset of a target's gaps that are still open (not resolved). The
 *  single source for "active gaps" used by readiness, goal-fit, wheel
 *  health, and the card's counts. */
export function openGaps(target: Pick<SelectedTarget, "gaps" | "resolvedItems">): Gap[] {
  return target.gaps.filter((g) => !isCareerItemResolved(target, "gap", g.id));
}

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

// ── Inner-ring outcomes (#421) ───────────────────────────────────────────────

/** The four inner-ring segment ids — funnel outcomes the wheel colors
 *  in once there's enough real signal. Mirrors `INNER_BLUEPRINT` in the
 *  Career 360 page so the server and the wheel agree on the keys. */
export const OUTCOME_SEGMENT_IDS = [
  "callback-rate",
  "interview-conversion",
  "offer-rate",
  "goal-fit",
] as const;
export type OutcomeSegmentId = (typeof OUTCOME_SEGMENT_IDS)[number];

/** One inner-ring outcome. `rate` is the underlying 0..1 ratio when the
 *  signal is funnel-derived (callback / interview-conversion / offer) or
 *  the 0..1 goal-fit score; `null` when there's no measurable rate.
 *  `sampleSize` is the denominator the rate was computed over — 0 (or
 *  below the per-signal floor) yields `health: "unknown"` so a couple of
 *  applications can't paint the ring a misleading green or red. */
export const OutcomeSignalSchema = z.object({
  id: z.enum(OUTCOME_SEGMENT_IDS),
  health: z.enum(["good", "moderate", "poor", "unknown"]),
  rate: z.number().nullable(),
  sampleSize: z.number().int().nonnegative(),
});
export type OutcomeSignal = z.infer<typeof OutcomeSignalSchema>;

/** The four inner-ring outcomes, in `OUTCOME_SEGMENT_IDS` order. */
export const Career360OutcomesSchema = z.array(OutcomeSignalSchema);
export type Career360Outcomes = z.infer<typeof Career360OutcomesSchema>;

export interface Career360StateResponse {
  doc: CareerTargetDoc | null;
  history: ScoreHistorySeries[];
  /** Inner-ring funnel outcomes (#421). Empty only for ancient clients /
   *  payloads predating the field; the page treats a missing entry as
   *  "unknown". */
  outcomes: Career360Outcomes;
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

/** Toggle a single gap or roadmap step's resolved state. Persists onto
 *  the saved plan (unlike `evaluate`, which is read-only) so the seeker
 *  can permanently retire an item the re-evaluation showed is no longer
 *  an issue. */
export const ResolveItemRequestSchema = z.object({
  itemId: z.string().min(1),
  kind: z.enum(["gap", "step"]),
  resolved: z.boolean(),
  /** Optional re-evaluation verdict to stamp on the resolved record. */
  verdict: z.enum(["closed", "partial", "open", "uncertain"]).optional(),
});
export type ResolveItemRequest = z.infer<typeof ResolveItemRequestSchema>;
