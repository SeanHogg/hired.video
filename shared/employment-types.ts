/**
 * Employment-type SSoT (#1673) — one canonical vocabulary + a normalizer
 * that folds the three legacy spellings into it.
 *
 * Before this, the same concept was spelled three ways across the stack:
 *   - JobCreatePage form values: PascalCase  (FullTime, Contractor, …)
 *   - shared/api.ts Zod enums:   kebab        (full-time, contract, …)  ×2 inline
 *   - JobService AI/scraper:     snake_case   (full_time, contract, …)
 * and the public-job filter does an exact `eq(jobItems.jobType, …)`, so a
 * job posted as "Contractor" silently never matched a filter "contract".
 *
 * Canonical form is kebab-case. Everything that READS or COMPARES an
 * employment type should `normalizeEmploymentType()` first; everything
 * that WRITES one should store the canonical value. Migration 0175
 * canonicalizes existing `job_items.job_type` rows.
 *
 * Exec opportunity types (#1674) live here too — board-seat / fractional
 * / advisor / interim — so the senior-exec audience can post + filter
 * them through the same single vocabulary.
 */

import { z } from "zod";

/** Canonical employment / engagement types, kebab-case. */
export const EMPLOYMENT_TYPES = [
  "full-time",
  "part-time",
  "contract",
  "contract-to-hire",
  "freelance",
  "internship",
  "temporary",
  "volunteer",
  // Exec opportunity types (#1674).
  "fractional",
  "advisor",
  "interim",
  "board-seat",
] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

/** Display labels — single source for dropdowns + cards. */
export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  "full-time": "Full-time",
  "part-time": "Part-time",
  contract: "Contract",
  "contract-to-hire": "Contract to Hire",
  freelance: "Freelance",
  internship: "Internship",
  temporary: "Temporary",
  volunteer: "Volunteer",
  fractional: "Fractional",
  advisor: "Advisor",
  interim: "Interim",
  "board-seat": "Board Seat",
};

const CANONICAL_SET = new Set<string>(EMPLOYMENT_TYPES);

/** Alias map for spellings that don't collapse to canonical by the
 *  generic lower+separator rule alone. Keys are already lower-cased with
 *  separators stripped (see `collapse`). */
const ALIAS: Record<string, EmploymentType> = {
  fulltime: "full-time",
  parttime: "part-time",
  contractor: "contract",
  contracttohire: "contract-to-hire",
  c2h: "contract-to-hire",
  intern: "internship",
  temp: "temporary",
  freelancer: "freelance",
  boardseat: "board-seat",
  board: "board-seat",
  advisory: "advisor",
};

function collapse(raw: string): string {
  return raw.toLowerCase().replace(/[\s_-]+/g, "");
}

/**
 * Fold any of the three legacy spellings (PascalCase / kebab / snake) — or
 * a casual free-text value — into the canonical kebab form. Returns null
 * when the input doesn't map to a known type, so callers can decide
 * whether to drop it or keep the raw string.
 *
 *   normalizeEmploymentType("FullTime")   → "full-time"
 *   normalizeEmploymentType("full_time")  → "full-time"
 *   normalizeEmploymentType("Contractor") → "contract"
 *   normalizeEmploymentType("nonsense")   → null
 */
export function normalizeEmploymentType(raw: string | null | undefined): EmploymentType | null {
  if (!raw) return null;
  const collapsed = collapse(raw);
  // Direct hit after collapsing separators (covers full-time/full_time/FullTime
  // → "fulltime" → needs alias; but contract/freelance/internship → exact).
  if (CANONICAL_SET.has(raw.toLowerCase())) return raw.toLowerCase() as EmploymentType;
  // Re-hyphenate the collapsed form and test against canonical (handles
  // "Full Time" / "full_time" → "fulltime" via alias; "contract" stays).
  if (CANONICAL_SET.has(collapsed)) return collapsed as EmploymentType;
  if (ALIAS[collapsed]) return ALIAS[collapsed];
  return null;
}

/**
 * Lenient Zod schema for an employment type at an API boundary — accepts
 * ANY of the three legacy spellings and outputs the canonical kebab value.
 * Use this on request/response schemas during the consolidation window so
 * a form still sending "FullTime" isn't rejected while the system
 * converges to canonical storage. Unknown values fall through to the enum
 * check and are rejected.
 */
export const EmploymentTypeSchema = z.preprocess(
  (v) => (typeof v === "string" ? (normalizeEmploymentType(v) ?? v) : v),
  z.enum(EMPLOYMENT_TYPES),
);
