/**
 * Question banks for the predictive assessments tool.
 *
 * Each bank is a flat array of `AssessmentQuestion` objects. The scoring
 * algorithm in `services/assessments/scoring.ts` aggregates responses by
 * `dimension` to produce the dimension scores surfaced on the results page.
 *
 * IPIP-NEO items (Big Five) are public-domain from ipip.ori.org and may
 * be used freely with attribution. Cognitive sample items are author-
 * generated under the same fair-use rationale as Wonderlic's sample
 * questions. Situational scenarios are paraphrased generic workplace
 * vignettes; no proprietary SHL / Korn Ferry items are reproduced.
 */

import type { AssessmentKind } from "./kinds.js";

export type ResponseScale = "agreement_5" | "agreement_7" | "multiple_choice" | "forced_choice_pair";

export interface AssessmentQuestion {
  id: string;
  /** Dimension this question scores against (matches AssessmentDimension.key). */
  dimension: string;
  prompt: string;
  scale: ResponseScale;
  /** For multiple_choice / forced_choice_pair — the option list. */
  options?: { value: string; label: string; /** points awarded if picked */ score: number; /** for forced_choice_pair only — opposing dimension */ opposite?: string }[];
  /** When true on an `agreement_*` scale, score is inverted (5 → 1, 4 → 2, …). */
  reverseScored?: boolean;
}

// ---------------------------------------------------------------------------
// Big Five — 10-item IPIP-NEO short form (public domain)
// ---------------------------------------------------------------------------
const BIG_FIVE_QUESTIONS: AssessmentQuestion[] = [
  { id: "b5_o1", dimension: "openness",          prompt: "I have a vivid imagination.",                              scale: "agreement_5" },
  { id: "b5_o2", dimension: "openness",          prompt: "I am not interested in abstract ideas.",                    scale: "agreement_5", reverseScored: true },
  { id: "b5_c1", dimension: "conscientiousness", prompt: "I get chores done right away.",                             scale: "agreement_5" },
  { id: "b5_c2", dimension: "conscientiousness", prompt: "I often forget to put things back in their proper place.",  scale: "agreement_5", reverseScored: true },
  { id: "b5_e1", dimension: "extraversion",      prompt: "I talk to a lot of different people at parties.",           scale: "agreement_5" },
  { id: "b5_e2", dimension: "extraversion",      prompt: "I keep in the background.",                                 scale: "agreement_5", reverseScored: true },
  { id: "b5_a1", dimension: "agreeableness",     prompt: "I sympathise with others' feelings.",                       scale: "agreement_5" },
  { id: "b5_a2", dimension: "agreeableness",     prompt: "I am not interested in other people's problems.",           scale: "agreement_5", reverseScored: true },
  { id: "b5_n1", dimension: "neuroticism",       prompt: "I get stressed out easily.",                                scale: "agreement_5" },
  { id: "b5_n2", dimension: "neuroticism",       prompt: "I am relaxed most of the time.",                            scale: "agreement_5", reverseScored: true },
];

// ---------------------------------------------------------------------------
// Cognitive sample — 5 items across numerical / verbal / abstract
// ---------------------------------------------------------------------------
const COGNITIVE_QUESTIONS: AssessmentQuestion[] = [
  {
    id: "cog_n1",
    dimension: "numerical",
    prompt: "Continue the series: 2, 6, 12, 20, 30, __",
    scale: "multiple_choice",
    options: [
      { value: "38", label: "38",  score: 0 },
      { value: "40", label: "40",  score: 0 },
      { value: "42", label: "42",  score: 1 },
      { value: "44", label: "44",  score: 0 },
    ],
  },
  {
    id: "cog_n2",
    dimension: "numerical",
    prompt: "If a 20% discount brings a price down to $96, what was the original price?",
    scale: "multiple_choice",
    options: [
      { value: "115.20", label: "$115.20", score: 0 },
      { value: "120.00", label: "$120.00", score: 1 },
      { value: "125.00", label: "$125.00", score: 0 },
      { value: "192.00", label: "$192.00", score: 0 },
    ],
  },
  {
    id: "cog_v1",
    dimension: "verbal",
    prompt: "ZENITH is to APEX as NADIR is to:",
    scale: "multiple_choice",
    options: [
      { value: "summit",  label: "Summit",      score: 0 },
      { value: "bottom",  label: "Bottom",      score: 1 },
      { value: "middle",  label: "Middle",      score: 0 },
      { value: "edge",    label: "Edge",        score: 0 },
    ],
  },
  {
    id: "cog_v2",
    dimension: "verbal",
    prompt: "Which word does NOT belong with the others?",
    scale: "multiple_choice",
    options: [
      { value: "rose",    label: "Rose",        score: 0 },
      { value: "tulip",   label: "Tulip",       score: 0 },
      { value: "oak",     label: "Oak",         score: 1 },
      { value: "lily",    label: "Lily",        score: 0 },
    ],
  },
  {
    id: "cog_a1",
    dimension: "abstract",
    prompt: "A → C → F → J → __? (offsets: +2, +3, +4, then…)",
    scale: "multiple_choice",
    options: [
      { value: "N", label: "N (offset +4)", score: 0 },
      { value: "O", label: "O (offset +5)", score: 1 },
      { value: "P", label: "P (offset +6)", score: 0 },
      { value: "M", label: "M (offset +3)", score: 0 },
    ],
  },
];

// ---------------------------------------------------------------------------
// Situational Judgment — 3 free + 12 pro scenarios
// ---------------------------------------------------------------------------
const SITUATIONAL_QUESTIONS: AssessmentQuestion[] = [
  {
    id: "sjt_1",
    dimension: "judgment",
    prompt: "A teammate ships code that breaks a downstream service at 4:50pm Friday. Their manager isn't online. What do you do first?",
    scale: "multiple_choice",
    options: [
      { value: "revert", label: "Roll back the change immediately and notify your teammate after.", score: 1 },
      { value: "wait",   label: "Wait for the manager to come online on Monday.",                    score: 0 },
      { value: "page",   label: "Page the manager's manager.",                                       score: 0 },
      { value: "fix",    label: "Attempt to forward-fix the bug yourself before reverting.",         score: 0 },
    ],
  },
  {
    id: "sjt_2",
    dimension: "self_awareness",
    prompt: "You're three weeks into a role and realise you over-promised on a Q1 deliverable in your interview. What's the right move?",
    scale: "multiple_choice",
    options: [
      { value: "escalate", label: "Tell your manager now and propose a revised scope.",                score: 1 },
      { value: "absorb",   label: "Work nights to hit the original commitment.",                       score: 0 },
      { value: "delay",    label: "Wait until the deadline gets closer and then flag the slippage.",   score: 0 },
      { value: "delegate", label: "Quietly shift the scope to a less-experienced teammate.",           score: 0 },
    ],
  },
  {
    id: "sjt_3",
    dimension: "team_orientation",
    prompt: "Your team's velocity would jump 20% if a struggling teammate were moved off the project. What do you advocate for?",
    scale: "multiple_choice",
    options: [
      { value: "coach",   label: "Pair with them for two sprints; reassess after.",                    score: 1 },
      { value: "move",    label: "Push for them to be reassigned immediately.",                        score: 0 },
      { value: "ignore",  label: "Don't say anything; their manager will notice.",                     score: 0 },
      { value: "report",  label: "Bring it up in your manager's 1:1 with a request for action.",       score: 0 },
    ],
  },
];

// ---------------------------------------------------------------------------
// EQ — 5-item sample (the full battery is 30; gated to Pro at run-start)
// ---------------------------------------------------------------------------
const EQ_QUESTIONS: AssessmentQuestion[] = [
  { id: "eq_sa1", dimension: "self_awareness", prompt: "I can usually name what I'm feeling within a minute of feeling it.",                          scale: "agreement_5" },
  { id: "eq_r1",  dimension: "regulation",     prompt: "When I'm angry, I usually wait at least an hour before responding to whoever upset me.",      scale: "agreement_5" },
  { id: "eq_em1", dimension: "empathy",        prompt: "I can usually predict how a colleague will feel about an upcoming decision before I tell them.", scale: "agreement_5" },
  { id: "eq_ss1", dimension: "social_skill",   prompt: "I'm comfortable raising a difficult topic in a group even when nobody else is.",              scale: "agreement_5" },
  { id: "eq_sa2", dimension: "self_awareness", prompt: "I notice when my mood is being driven by something unrelated to the conversation I'm in.",    scale: "agreement_5" },
];

// ---------------------------------------------------------------------------
// DISC — 28-item forced-choice (4 items shipped here as a starter set; the
// full 28 lives in the Pro paywall response from the start endpoint).
// ---------------------------------------------------------------------------
const DISC_QUESTIONS: AssessmentQuestion[] = [
  {
    id: "disc_1",
    dimension: "dominance",
    prompt: "Which of these adjectives describes you best at work?",
    scale: "forced_choice_pair",
    options: [
      { value: "direct",       label: "Direct",       score: 1, opposite: "patient" },
      { value: "patient",      label: "Patient",      score: 1, opposite: "direct" },
    ],
  },
  {
    id: "disc_2",
    dimension: "influence",
    prompt: "Which describes you under pressure?",
    scale: "forced_choice_pair",
    options: [
      { value: "enthusiastic", label: "Enthusiastic", score: 1, opposite: "analytical" },
      { value: "analytical",   label: "Analytical",   score: 1, opposite: "enthusiastic" },
    ],
  },
  {
    id: "disc_3",
    dimension: "steadiness",
    prompt: "Which best describes your decision style?",
    scale: "forced_choice_pair",
    options: [
      { value: "consistent",   label: "Consistent",   score: 1, opposite: "adventurous" },
      { value: "adventurous",  label: "Adventurous",  score: 1, opposite: "consistent" },
    ],
  },
  {
    id: "disc_4",
    dimension: "conscientiousness",
    prompt: "Which best describes how you approach a new project?",
    scale: "forced_choice_pair",
    options: [
      { value: "precise",      label: "Precise",      score: 1, opposite: "spontaneous" },
      { value: "spontaneous",  label: "Spontaneous",  score: 1, opposite: "precise" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Public lookup
// ---------------------------------------------------------------------------

const BANKS: Partial<Record<AssessmentKind, AssessmentQuestion[]>> = {
  big_five: BIG_FIVE_QUESTIONS,
  cognitive_sample: COGNITIVE_QUESTIONS,
  situational_judgment: SITUATIONAL_QUESTIONS,
  emotional_intelligence: EQ_QUESTIONS,
  disc_profile: DISC_QUESTIONS,
  // resume_predictive_match has no questions — it derives from the résumé.
};

export function getQuestionBank(kind: AssessmentKind): AssessmentQuestion[] {
  return BANKS[kind] ?? [];
}
