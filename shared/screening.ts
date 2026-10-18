/**
 * Candidate screening — single source of truth for the item types a recruiter
 * or employer can put on a screening template, their config shapes, and the
 * rule for which items are ALWAYS required regardless of template authoring.
 *
 * Why this lives in shared/ — three readers must agree on the same descriptors
 * or the feature silently drifts:
 *   1. the recruiter template builder (renders the item picker + required toggle),
 *   2. the backend template/request services (validate refId + config, enforce
 *      the always-required floor, snapshot items onto a request),
 *   3. the candidate portal (renders the outstanding item for completion).
 *
 * Adding a new screening item is a single entry in SCREENING_ITEM_CATALOG plus
 * a branch in the pitch-book resolver (does the candidate already have it?) and
 * the portal renderer (how do they complete it?). No schema change — itemType
 * is a varchar and the per-item config is JSONB.
 *
 * Naming intent — a "screening template" is the reusable, per-role checklist a
 * company authors once; a "screening request" is one instance sent to one
 * candidate via a magic link. Results produced by completing items are
 * candidate-level (they live on the candidate's existing assessment/résumé/
 * reference records — the "pitch book") even when the request was job-scoped.
 */

import { z } from "zod";
import { type AssessmentKind, isAssessmentKind } from "./assessments/kinds.js";

// ---------------------------------------------------------------------------
// Item types
// ---------------------------------------------------------------------------

export const SCREENING_ITEM_TYPES = [
  "resume",
  "contact_info",
  "predictive_assessment",
  "competency_test",
  "video_interview",
  "references",
  "tool_run",
  "application_questions",
  // #1853 — recruiter-run conversational AI screen. The candidate completes a
  // short chat with an AI screener (focused by `instructions`); the produced
  // transcript + score land on the item's result_ref. Never pre-satisfiable
  // (it's run fresh for this screen) — see the pitch-book resolver.
  "ai_screening_chat",
] as const;

export type ScreeningItemType = (typeof SCREENING_ITEM_TYPES)[number];

/**
 * Items the candidate must always supply before a request can complete, no
 * matter what the template author selected. Enforced server-side at request
 * creation so a misconfigured template can never let a candidate through
 * without a résumé + confirmed contact details. The recruiter UI renders
 * these as locked-required rows.
 */
export const ALWAYS_REQUIRED_ITEM_TYPES: readonly ScreeningItemType[] = [
  "resume",
  "contact_info",
];

export function isAlwaysRequired(t: ScreeningItemType): boolean {
  return ALWAYS_REQUIRED_ITEM_TYPES.includes(t);
}

// ---------------------------------------------------------------------------
// Per-item config schemas (stored in JSONB; validated on write)
// ---------------------------------------------------------------------------

/** A single employer application question — reused for EEO / work-authorization
 *  / visa-sponsorship / knockout / free-form asks. `kind` drives any special
 *  handling (e.g. EEO answers are stored but never gate "proceed"). */
export const ApplicationQuestionSchema = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1).max(1000),
  kind: z
    .enum(["custom", "work_authorization", "visa_sponsorship", "eeo_disability", "knockout"])
    .default("custom"),
  answerType: z.enum(["text", "boolean", "single_select", "multi_select"]).default("text"),
  options: z.array(z.string().max(200)).max(20).optional(),
  required: z.boolean().default(true),
});
export type ApplicationQuestion = z.infer<typeof ApplicationQuestionSchema>;

/** Per-item config union, keyed loosely by itemType. Every field optional so a
 *  bare `{}` is valid for items that need no config (resume, contact_info). */
export const ScreeningItemConfigSchema = z.object({
  /** predictive_assessment → which validated instrument. */
  assessmentKind: z.string().optional(),
  /** references → how many references the candidate must supply. */
  minReferences: z.number().int().min(1).max(10).optional(),
  /** tool_run → the tools-catalog id (e.g. "ai-resume-scorer"). */
  toolId: z.string().optional(),
  /** application_questions → the question set. */
  questions: z.array(ApplicationQuestionSchema).max(50).optional(),
  /** Optional recruiter-facing instructions surfaced on the portal item. */
  instructions: z.string().max(2000).optional(),
});
export type ScreeningItemConfig = z.infer<typeof ScreeningItemConfigSchema>;

// ---------------------------------------------------------------------------
// Catalog — what a recruiter can pick from
// ---------------------------------------------------------------------------

export interface ScreeningCatalogEntry {
  itemType: ScreeningItemType;
  title: string;
  description: string;
  /** Locked on (always required) — UI renders the toggle disabled + on. */
  alwaysRequired: boolean;
  /** Whether this item needs a concrete `refId` (e.g. a competency test id or
   *  an interview question-set id) chosen at template-build time. */
  needsRef: boolean;
  /** Whether the item carries structured config (assessment kind, question
   *  list, reference count, tool id). */
  needsConfig: boolean;
}

export const SCREENING_ITEM_CATALOG: ScreeningCatalogEntry[] = [
  {
    itemType: "resume",
    title: "Résumé",
    description: "Candidate provides a résumé (uploaded file + extracted structured copy).",
    alwaysRequired: true,
    needsRef: false,
    needsConfig: false,
  },
  {
    itemType: "contact_info",
    title: "Confirm contact information",
    description: "Candidate confirms email and phone before proceeding.",
    alwaysRequired: true,
    needsRef: false,
    needsConfig: false,
  },
  {
    itemType: "predictive_assessment",
    title: "Validated AI assessment",
    description: "Big Five, cognitive, situational judgment, EQ, DISC, or résumé→profile match.",
    alwaysRequired: false,
    needsRef: false,
    needsConfig: true,
  },
  {
    itemType: "competency_test",
    title: "Competency test",
    description: "Timed, AI-graded skill assessment from your company's test library.",
    alwaysRequired: false,
    needsRef: true,
    needsConfig: false,
  },
  {
    itemType: "video_interview",
    title: "Async video interview",
    description: "Magic-link video (or text) screening from a reusable question set.",
    alwaysRequired: false,
    needsRef: true,
    needsConfig: false,
  },
  {
    itemType: "references",
    title: "References",
    description: "Candidate supplies professional references.",
    alwaysRequired: false,
    needsRef: false,
    needsConfig: true,
  },
  {
    itemType: "tool_run",
    title: "Run a tool",
    description: "Ask the candidate to run a hired.video tool (e.g. AI Résumé Scorer).",
    alwaysRequired: false,
    needsRef: false,
    needsConfig: true,
  },
  {
    itemType: "application_questions",
    title: "Application questions",
    description:
      "Work authorization, visa sponsorship, EEO self-ID, knockouts, or free-form questions.",
    alwaysRequired: false,
    needsRef: false,
    needsConfig: true,
  },
  {
    itemType: "ai_screening_chat",
    title: "AI screening chat",
    description:
      "Candidate completes a short conversational AI screen; you get a transcript + score.",
    alwaysRequired: false,
    needsRef: false,
    needsConfig: true,
  },
];

const CATALOG_BY_TYPE: Record<ScreeningItemType, ScreeningCatalogEntry> = Object.fromEntries(
  SCREENING_ITEM_CATALOG.map((e) => [e.itemType, e]),
) as Record<ScreeningItemType, ScreeningCatalogEntry>;

export function getScreeningCatalogEntry(t: ScreeningItemType): ScreeningCatalogEntry {
  const e = CATALOG_BY_TYPE[t];
  if (!e) throw new Error(`Unknown screening item type: ${t}`);
  return e;
}

// ---------------------------------------------------------------------------
// Validation — used by the template + request services
// ---------------------------------------------------------------------------

/** Result statuses for an item on a sent request. */
export const SCREENING_ITEM_STATUSES = ["outstanding", "satisfied", "skipped"] as const;
export type ScreeningItemStatus = (typeof SCREENING_ITEM_STATUSES)[number];

/** How an item came to be satisfied — pulled from the candidate's existing
 *  pitch book, or completed fresh inside this request's portal. */
export const SCREENING_SATISFIED_SOURCES = ["pre_existing", "completed_now"] as const;
export type ScreeningSatisfiedSource = (typeof SCREENING_SATISFIED_SOURCES)[number];

/** Request lifecycle. */
export const SCREENING_REQUEST_STATUSES = [
  "pending",
  "in_progress",
  "completed",
  "expired",
] as const;
export type ScreeningRequestStatus = (typeof SCREENING_REQUEST_STATUSES)[number];

/**
 * Validate that a (itemType, refId, config) triple is internally consistent.
 * Returns a normalized config or throws a descriptive Error the route layer
 * turns into a 400. Centralized here so the template builder and any future
 * import path enforce the same rules.
 */
export function validateScreeningItem(input: {
  itemType: ScreeningItemType;
  refId?: string | null;
  config?: unknown;
}): ScreeningItemConfig {
  const entry = getScreeningCatalogEntry(input.itemType);
  const config = ScreeningItemConfigSchema.parse(input.config ?? {});

  if (entry.needsRef && !input.refId) {
    throw new Error(`${entry.title} requires a selection`);
  }

  if (input.itemType === "predictive_assessment") {
    if (!config.assessmentKind || !isAssessmentKind(config.assessmentKind)) {
      throw new Error("Choose a valid validated-assessment instrument");
    }
  }

  if (input.itemType === "tool_run" && !config.toolId) {
    throw new Error("Choose which tool the candidate should run");
  }

  if (input.itemType === "application_questions" && (!config.questions || config.questions.length === 0)) {
    throw new Error("Add at least one application question");
  }

  if (input.itemType === "references" && config.minReferences == null) {
    config.minReferences = 2;
  }

  if (input.itemType === "ai_screening_chat" && !config.instructions?.trim()) {
    throw new Error("Add screening instructions so the AI knows what to assess");
  }

  return config;
}

/** Narrow the predictive-assessment kind off a validated config. */
export function assessmentKindFromConfig(config: ScreeningItemConfig): AssessmentKind | null {
  return config.assessmentKind && isAssessmentKind(config.assessmentKind)
    ? config.assessmentKind
    : null;
}
