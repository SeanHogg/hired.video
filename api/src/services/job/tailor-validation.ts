/**
 * Tailor — output validation: every input work / education entry must
 * survive the rewrite. Pure — no I/O. Split out of tailor-edits.ts.
 */
import { ResumeContentSchema, type ResumeContent } from "../../../../shared/resume.js";

// ---------------------------------------------------------------------------
// Tailor — JSON pipeline helpers
//
// The tailor endpoint has two implementations today:
//
//   • handleTailorLegacy — the original flat-text pipeline. Flattens the
//     job and the resume to plain strings, asks the LLM for a Markdown
//     resume, returns { markdownResume, summaryRecommendations, scores }.
//     Kept for backward compatibility and for the parallel-comparison
//     log that drives the RESUME_TAILOR rollout.
//
//   • handleTailorJson — the JSON-preserving pipeline. Ships the
//     ParsedJob + ResumeContent JSON to the LLM, requires a full
//     tailoredResume JSON back along with justified changes[], and
//     validates that every input work/education entry survived the
//     rewrite. Retries once with a strengthened prompt on validation
//     failure. This is the path that makes "Save as Variation" a
//     one-line pass-through.
//
// `handleTailor` is a thin facade: it runs both paths in parallel,
// logs a structured comparison record, and returns the result selected
// by the `tailorJsonEnabled` flag (wired from the `RESUME_TAILOR`
// Cloudflare env var in routes/match.ts).
// ---------------------------------------------------------------------------

/** Result envelope used by the JSON validator. */
export interface TailorValidationResult {
  valid: boolean;
  errors: string[];
  /** Work entry `name` values present in the input but dropped in the output. */
  missingWorkEntries: string[];
  /** Education `institution` values present in the input but dropped in the output. */
  missingEducationInstitutions: string[];
}

/**
 * Validate that the LLM-tailored resume preserves every work and
 * education entry from the input. The whole point of the JSON pipeline
 * is that the LLM is not allowed to drop jobs — if it does, we retry
 * with a stronger prompt.
 *
 * Also Zod-validates the output against `ResumeContentSchema` so we
 * catch shape drift (wrong field types, missing required sub-fields)
 * before anything reaches the client or the DB.
 *
 * Pure — no I/O, no mutation. Returns a single structured result so
 * the retry/prompt-strengthening code can branch on what went wrong.
 */
export function validateTailorOutput(
  input: ResumeContent,
  output: unknown,
): TailorValidationResult {
  const errors: string[] = [];
  const missingWorkEntries: string[] = [];
  const missingEducationInstitutions: string[] = [];

  const parsed = ResumeContentSchema.safeParse(output);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    errors.push(`Schema validation failed: ${issues}`);
    return { valid: false, errors, missingWorkEntries, missingEducationInstitutions };
  }

  const outputData = parsed.data;

  // Work entries — preserve every company/name. Compare case-
  // insensitively and trim so the LLM "Acme" vs "acme " doesn't count
  // as a drop; the original casing still survives through whatever
  // entry does match.
  const norm = (s: string) => s.trim().toLowerCase();
  const outputWorkNames = new Set(
    (outputData.work ?? []).map((w) => norm(w.name ?? "")).filter((s) => s.length > 0),
  );
  for (const w of input.work ?? []) {
    const name = (w.name ?? "").trim();
    if (!name) continue;
    if (!outputWorkNames.has(norm(name))) {
      missingWorkEntries.push(name);
      errors.push(`Missing work entry: ${name}`);
    }
  }

  const outputInstitutions = new Set(
    (outputData.education ?? [])
      .map((e) => norm(e.institution ?? ""))
      .filter((s) => s.length > 0),
  );
  for (const e of input.education ?? []) {
    const institution = (e.institution ?? "").trim();
    if (!institution) continue;
    if (!outputInstitutions.has(norm(institution))) {
      missingEducationInstitutions.push(institution);
      errors.push(`Missing education entry: ${institution}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    missingWorkEntries,
    missingEducationInstitutions,
  };
}
