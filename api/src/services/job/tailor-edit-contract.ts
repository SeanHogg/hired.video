/**
 * Tailor — the model's compact EDIT contract (gap #2109): the wire schemas
 * for edits + gaps, the response envelope, and its lenient ingest spec.
 * Pure — no I/O. Split out of tailor-edits.ts (now a re-export facade).
 */
import { z } from "zod";
import { defineLenientIngest } from "../../services/adapters/llm-client.js";

/** LLMs sometimes return recommendations as string[] instead of string. */
export const coerceToString = z
  .union([
    z.string(),
    z.array(z.string()).transform((arr) => arr.map((s) => `- ${s}`).join("\n")),
  ])
  .pipe(z.string());


// ─── Tailor edit contract (gap #2109 — diff-only output) ───────────────────
//
// The model NO LONGER echoes the whole tailored resume. It returns a small
// set of structured EDITS; the server applies them to the source document
// (see `applyResumeEdits`) and re-derives the full `tailoredResume` + the
// human-readable `changes[]` trail. Two wins over the old full-echo schema:
//   • the request's strict `responseSchema` shrinks from the entire
//     `ResumeContentSchema` (~163 decoding states — which Gemini rejected
//     with `400 too many states`, gap #1801) to a handful of fields, so
//     strict-mode vendor conformance works again;
//   • completion tokens roughly halve — the model writes only what changed,
//     not a verbatim copy of every untouched section.
//
// The op-set is deliberately ADDITIVE: there is no "remove entry" operation,
// so no work/education entry can ever be dropped — the preservation guarantee
// the JSON pipeline exists to enforce now holds by construction.
//
// Flat (non-discriminated) shape on purpose: free-tier models fudge the
// `op`/`section` strings, so we keep the wire schema permissive and let
// `applyResumeEdits` interpret + coerce defensively (unmatched / unknown
// edits are skipped, never fatal).
export const TailorEditSchemaWire = z.object({
  /** basics | highlights | summary | skills (normalised in applyResumeEdits). */
  op: z.string().min(1),
  /** For highlights/summary: which list to target — work | volunteer | projects. */
  section: z.string().optional(),
  /** Natural key of the target entry — work[].name / volunteer[].organization
   *  / projects[].name, copied verbatim from the input so the server can
   *  locate it. */
  match: z.string().optional(),
  /** basics headline. */
  label: z.string().optional(),
  /** basics professional summary, OR a work/volunteer/project entry summary. */
  summary: z.string().optional(),
  /** Full replacement highlight list for the matched entry. */
  highlights: z.array(z.string()).optional(),
  /** Full replacement skills section. */
  skills: z
    .array(
      z.object({
        name: z.string(),
        level: z.string().optional(),
        keywords: z.array(z.string()).default([]),
      }),
    )
    .optional(),
  /** One-sentence justification, surfaced in the derived changes[] trail. */
  why: z.string().optional(),
});
export type TailorEdit = z.infer<typeof TailorEditSchemaWire>;

/** What the job asks for that the résumé has no evidence of. Permissive on
 *  the wire (free models fudge `kind`); `toJobGaps` normalises it. */
export const TailorGapWireSchema = z.object({
  requirement: z.string(),
  kind: z.string().optional(),
  question: z.string().optional(),
  skill: z.string().optional(),
  /** Natural key of the entry the answer most likely belongs to. */
  match: z.string().optional(),
  section: z.string().optional(),
});
export type TailorGapWire = z.infer<typeof TailorGapWireSchema>;

export const TailorEditResponseSchema = z.object({
  oldScore: z.number().min(0).max(100),
  newScore: z.number().min(0).max(100),
  edits: z.array(TailorEditSchemaWire).default([]),
  gaps: z.array(TailorGapWireSchema).default([]),
  /** The job's keywords the résumé already shows (#2344) — verified against
   *  the résumé server-side (matched-keywords.ts) before anyone sees them. */
  matchedKeywords: z.array(z.string()).default([]),
  summaryRecommendations: coerceToString,
});
export type TailorEditResponse = z.infer<typeof TailorEditResponseSchema>;

/** Lenient ingest for the tailor edits. The wire schema is already
 *  permissive (string `op`/`section`, every field optional), so the coerce
 *  step is the identity — all interpretation/normalisation lives in
 *  `applyResumeEdits` where it can be unit-tested in isolation. */
export const TailorEditResponseIngest = defineLenientIngest({
  name: "MatchTailorEdits",
  ingest: TailorEditResponseSchema,
  coerce: (wire): TailorEditResponse => wire,
});
