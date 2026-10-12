/**
 * Seniority / experience-level SSoT (#2090) — one canonical vocabulary + a
 * normalizer that folds the divergent spellings into it. Mirrors
 * `shared/employment-types.ts`, which was created to kill exactly this class
 * of bug for `job_type`.
 *
 * Before this, the same concept was spelled three ways across the stack:
 *   - JobCreatePage form values:  PascalCase  (Entry/Junior/Mid/Senior/LeadExecutive/None)
 *   - shared/api.ts read enum:    lowercase   (entry/mid/senior/lead/executive)
 *   - JobService AI/scraper:      lowercase   (entry/mid/senior/executive)
 * and the public-job filter does an exact `eq(jobItems.experienceLevel, …)`,
 * so a job posted as "Senior" silently never matched a filter "senior".
 *
 * Canonical form is lowercase. Everything that READS or COMPARES a seniority
 * value should `normalizeSeniority()` first; everything that WRITES one should
 * store the canonical value. Migration 0340 canonicalizes existing
 * `job_items.experience_level` rows (and NULLs the "None"/not-specified ones).
 */

import { z } from "zod";

/** Canonical seniority / experience levels, lowercase. */
export const SENIORITY_LEVELS = [
  "entry",
  "junior",
  "mid",
  "senior",
  "lead",
  "executive",
] as const;
export type SeniorityLevel = (typeof SENIORITY_LEVELS)[number];

/** Display labels — single source for dropdowns + cards. */
export const SENIORITY_LABELS: Record<SeniorityLevel, string> = {
  entry: "Entry Level",
  junior: "Junior",
  mid: "Mid Level",
  senior: "Senior",
  lead: "Lead",
  executive: "Executive",
};

const CANONICAL_SET = new Set<string>(SENIORITY_LEVELS);

/** Alias map for spellings that don't collapse to canonical by the generic
 *  lower+separator-strip rule alone. Keys are already collapsed (see
 *  `collapse`). The form's combined "LeadExecutive" maps to `lead` (the more
 *  common posting); explicit exec spellings (vp/director/c-level) resolve to
 *  `executive`. */
const ALIAS: Record<string, SeniorityLevel> = {
  entrylevel: "entry",
  entrylevelposition: "entry",
  graduate: "entry",
  intern: "entry",
  jr: "junior",
  juniorlevel: "junior",
  associate: "junior",
  midlevel: "mid",
  intermediate: "mid",
  sr: "senior",
  seniorlevel: "senior",
  leadexecutive: "lead",
  staff: "lead",
  principal: "lead",
  manager: "lead",
  director: "executive",
  vp: "executive",
  vicepresident: "executive",
  clevel: "executive",
  csuite: "executive",
  exec: "executive",
  executivelevel: "executive",
};

/** Values that explicitly mean "not specified" → normalize to null. */
const NOT_SPECIFIED = new Set(["none", "notspecified", "any", "unspecified", "na"]);

function collapse(raw: string): string {
  return raw.toLowerCase().replace(/[\s_/-]+/g, "");
}

/**
 * Fold any spelling (PascalCase form value, lowercase read/scraper value, or a
 * casual free-text value) into the canonical lowercase form. Returns null when
 * the input is empty, an explicit "not specified", or unmapped — so callers can
 * store NULL rather than an un-filterable raw string.
 *
 *   normalizeSeniority("Senior")        → "senior"
 *   normalizeSeniority("LeadExecutive") → "lead"
 *   normalizeSeniority("Sr.")           → "senior"  (collapses to "sr")
 *   normalizeSeniority("None")          → null
 *   normalizeSeniority("nonsense")      → null
 */
export function normalizeSeniority(raw: string | null | undefined): SeniorityLevel | null {
  if (!raw) return null;
  const lower = raw.toLowerCase().trim();
  if (!lower) return null;
  const collapsed = collapse(raw).replace(/\.+$/, "");
  if (NOT_SPECIFIED.has(collapsed)) return null;
  if (CANONICAL_SET.has(lower)) return lower as SeniorityLevel;
  if (CANONICAL_SET.has(collapsed)) return collapsed as SeniorityLevel;
  if (ALIAS[collapsed]) return ALIAS[collapsed];
  return null;
}

/**
 * Lenient Zod schema for a seniority value at an API boundary — accepts any
 * spelling and outputs the canonical lowercase value, or `null` for
 * not-specified / unmapped. Use on request/response schemas during the
 * consolidation window so a form still sending "Senior" isn't rejected.
 */
export const SenioritySchema = z.preprocess(
  (v) => (typeof v === "string" ? normalizeSeniority(v) : v),
  z.enum(SENIORITY_LEVELS).nullable(),
);
