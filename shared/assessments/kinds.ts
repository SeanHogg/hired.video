/**
 * Predictive assessments — single source of truth for the kinds the tool
 * surfaces, their tier gating, scoring dimensions, and question banks.
 *
 * Why this lives in shared/ — both the backend (validating responses,
 * computing scores, persisting runs) and the frontend (rendering the
 * question UI, the kind picker, the results page) read off the same
 * descriptors. Adding a new assessment kind is a single object literal
 * + a question bank append; no schema change.
 *
 * Naming intent — these are validated-PSYCH-INSPIRED instruments based
 * on public-domain IPIP items (Big Five) and platform-derived heuristic
 * batteries for cognitive / situational / EQ. They are NOT the proprietary
 * Hogan / PI / DISC instruments themselves, which are IP-licensed. The
 * UI copy is explicit about this so candidates and recruiters understand
 * what they're seeing.
 */

export type AssessmentKind =
  | "big_five"
  | "cognitive_sample"
  | "situational_judgment"
  | "emotional_intelligence"
  | "disc_profile"
  | "resume_predictive_match";

export type AssessmentTier = "free" | "pro";

export interface AssessmentDescriptor {
  kind: AssessmentKind;
  title: string;
  oneLiner: string;
  longDescription: string;
  tier: AssessmentTier;
  /** Minutes the median taker spends on the assessment. */
  estimatedMinutes: number;
  /** Dimensions this assessment reports back. */
  dimensions: AssessmentDimension[];
  /** Total questions (drives the progress bar). */
  questionCount: number;
  /** Inspired-by attribution shown beneath the title. */
  inspiredBy: string;
}

export interface AssessmentDimension {
  /** Stable key under scores[<key>]. */
  key: string;
  label: string;
  /** One-sentence interpretation rendered on the results page. */
  blurb: string;
  /** When `inverse` is true, a *low* score is the desirable pole. */
  inverse?: boolean;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const ASSESSMENT_KINDS: AssessmentDescriptor[] = [
  {
    kind: "big_five",
    title: "Big Five Personality (OCEAN)",
    oneLiner: "Open-source IPIP-NEO short form — the five-factor model used by every modern psychometric.",
    longDescription:
      "Measures Openness, Conscientiousness, Extraversion, Agreeableness, and Neuroticism. The single most validated personality model in occupational psychology — meta-analyses across 1.5M+ subjects show consistent correlation between Big Five scores and job performance for most knowledge-work roles.",
    tier: "free",
    estimatedMinutes: 5,
    questionCount: 10,
    inspiredBy: "IPIP-NEO short form (public domain)",
    dimensions: [
      { key: "openness",           label: "Openness",           blurb: "Curiosity, imagination, willingness to try new approaches." },
      { key: "conscientiousness",  label: "Conscientiousness",  blurb: "Self-discipline, organisation, follow-through on commitments." },
      { key: "extraversion",       label: "Extraversion",       blurb: "Energy from social interaction, comfort taking the lead in groups." },
      { key: "agreeableness",      label: "Agreeableness",      blurb: "Cooperation, trust, tendency to prioritise team over self." },
      { key: "neuroticism",        label: "Emotional Stability", blurb: "Reverse-scored from Neuroticism — calm under pressure, resilient to setbacks.", inverse: true },
    ],
  },
  {
    kind: "cognitive_sample",
    title: "Cognitive Ability Sample",
    oneLiner: "Five-question sample covering numerical, verbal, and abstract reasoning.",
    longDescription:
      "A taster of the cognitive batteries used by Wonderlic, CCAT, and PI Cognitive. The full battery is a 50-item, 12-minute test that's strongly predictive of job performance across roles. This sample shows you the shape of the questions — not a calibrated score.",
    tier: "free",
    estimatedMinutes: 3,
    questionCount: 5,
    inspiredBy: "Wonderlic / CCAT structure (sample only)",
    dimensions: [
      { key: "numerical",  label: "Numerical Reasoning",  blurb: "Arithmetic + pattern recognition in numeric series." },
      { key: "verbal",     label: "Verbal Reasoning",     blurb: "Word relationships, analogies, comprehension." },
      { key: "abstract",   label: "Abstract Reasoning",   blurb: "Pattern matching in visual / logical sequences." },
    ],
  },
  {
    kind: "situational_judgment",
    title: "Situational Judgment",
    oneLiner: "Workplace scenarios — pick the best response. Predictive of soft-skills role fit.",
    longDescription:
      "SJTs are validated for sales, customer success, healthcare, retail, and management roles. Used by Korn Ferry, SHL, and most enterprise ATS assessment packs. This short form covers three scenarios; the Pro battery covers fifteen across team conflict, prioritisation, and ethical dilemmas.",
    tier: "pro",
    estimatedMinutes: 7,
    questionCount: 15,
    inspiredBy: "SHL / Korn Ferry SJT format",
    dimensions: [
      { key: "judgment",        label: "Decision Quality",      blurb: "Picks the option the modal experienced professional would pick." },
      { key: "self_awareness",  label: "Self-Awareness",        blurb: "Recognises when to escalate vs. handle alone." },
      { key: "team_orientation", label: "Team Orientation",     blurb: "Weighs team outcomes against individual short-term win." },
    ],
  },
  {
    kind: "emotional_intelligence",
    title: "Emotional Intelligence (EQ)",
    oneLiner: "Self-rated EQ across awareness, regulation, empathy, and social skill.",
    longDescription:
      "A 30-item EQ battery in the style of MSCEIT / EQ-i 2.0. Strong predictor of management role fit and customer-facing role retention. Pro tier; the short sample below shows the question shape.",
    tier: "pro",
    estimatedMinutes: 8,
    questionCount: 30,
    inspiredBy: "MSCEIT / EQ-i 2.0 structure",
    dimensions: [
      { key: "self_awareness", label: "Self-Awareness", blurb: "Notices and names your own emotional state in the moment." },
      { key: "regulation",     label: "Self-Regulation", blurb: "Modulates reaction; avoids impulsive action under stress." },
      { key: "empathy",        label: "Empathy",         blurb: "Reads emotional states in others; predicts how they'll feel about an outcome." },
      { key: "social_skill",   label: "Social Skill",    blurb: "Translates emotional read into effective influence + cooperation." },
    ],
  },
  {
    kind: "disc_profile",
    title: "DISC Behavioural Profile",
    oneLiner: "Four-quadrant behavioural style — Dominance, Influence, Steadiness, Conscientiousness.",
    longDescription:
      "Workplace-behaviour styles used in team composition, sales territory matching, and management coaching. This is a 28-item forced-choice DISC inspired by the original Marston framework. Pro tier.",
    tier: "pro",
    estimatedMinutes: 6,
    questionCount: 28,
    inspiredBy: "Marston DISC framework",
    dimensions: [
      { key: "dominance",        label: "Dominance (D)",       blurb: "Drives results, direct, accepts challenge." },
      { key: "influence",        label: "Influence (I)",       blurb: "Persuasive, optimistic, energy-bringer." },
      { key: "steadiness",       label: "Steadiness (S)",      blurb: "Patient, dependable, calm under pressure." },
      { key: "conscientiousness", label: "Conscientiousness (C)", blurb: "Accurate, analytical, quality-focused." },
    ],
  },
  {
    kind: "resume_predictive_match",
    title: "Resume → Predictive Index Match",
    oneLiner: "Score your résumé against the personality + cognitive profile typical for a target role.",
    longDescription:
      "Reverse-engineers the role's expected Big Five + cognitive profile from a job description, then scores how strongly your résumé signals against those traits. The output is a five-axis spider chart + a narrative of where you over-index and where you under-index.",
    tier: "pro",
    estimatedMinutes: 1,
    questionCount: 0, // résumé-driven, no questions
    inspiredBy: "Composite of Big Five + Wonderlic-style cognitive",
    dimensions: [
      { key: "match_score",    label: "Overall Match",      blurb: "Weighted distance between your résumé profile and the role profile." },
      { key: "over_indexes",   label: "Where You Over-Index", blurb: "Traits where your résumé signals stronger than the role demands." },
      { key: "under_indexes",  label: "Where You Under-Index", blurb: "Traits the role expects that your résumé doesn't surface." },
    ],
  },
];

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

const REGISTRY: Record<AssessmentKind, AssessmentDescriptor> = Object.fromEntries(
  ASSESSMENT_KINDS.map((d) => [d.kind, d]),
) as Record<AssessmentKind, AssessmentDescriptor>;

export function getAssessmentDescriptor(kind: AssessmentKind): AssessmentDescriptor {
  const d = REGISTRY[kind];
  if (!d) throw new Error(`Unknown assessment kind: ${kind}`);
  return d;
}

export function isAssessmentKind(value: unknown): value is AssessmentKind {
  return typeof value === "string" && value in REGISTRY;
}

/** Free-tier kinds. Pro covers everything (no separate "pro-only" subset). */
export const FREE_ASSESSMENT_KINDS = ASSESSMENT_KINDS.filter((d) => d.tier === "free").map((d) => d.kind);
