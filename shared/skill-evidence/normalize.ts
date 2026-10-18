// Skill list normalisation — case-insensitive dedupe + optimisation.

import type {
  Skill,
} from "../resume.js";

// ─── Skill list normalisation ──────────────────────────────────────────────

export const LEVEL_RANK: Record<string, number> = {
  Beginner: 1,
  Intermediate: 2,
  Advanced: 3,
  Expert: 4,
};

export function dedupeStringsCaseInsensitive(arr: readonly string[] | undefined): string[] {
  if (!arr) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of arr) {
    if (typeof s !== "string") continue;
    const trimmed = s.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

/**
 * Normalise a JSON Resume `skills[]` array to remove the duplication
 * patterns that accumulate across multiple extractor / parse passes:
 *
 *   1. **Drop bare top-level rows whose name appears as a keyword under
 *      another row's category.** Example from a real resume on 2026-05-03:
 *      "Cloud Architecture (Expert)" has keywords [AWS, Azure, …] AND the
 *      same array also has bare top-level rows "AWS", "Azure". The
 *      keyword-under-category form is canonical (it preserves the parent
 *      category's level and grouping); the bare row is the duplicate.
 *
 *   2. **Merge case-insensitive name duplicates.** Two "Python" rows
 *      collapse into one; the merged row keeps the highest level,
 *      highest yearsOfExperience, and a deduped union of keywords.
 *
 *   3. **Dedupe keywords within each row** (case-insensitive).
 *
 * Pure — does not mutate input. Used by `mergeExtractedSkillsIntoResume`
 * after every merge AND by the frontend save-back path so re-running the
 * Skill Extractor on the same resume tightens the list instead of
 * appending more duplicates.
 */
/** Accept any partial-Skill shape (some callers — including the API
 *  merge step — work with row records where `level` may be undefined
 *  rather than the empty-string default the schema enforces). The
 *  function tolerates missing fields and emits canonical Skill rows. */
export type OptimizableSkill = Partial<Skill> & { name?: string };

export function dedupeAndOptimizeSkills(skills: OptimizableSkill[] | undefined): Skill[] {
  if (!Array.isArray(skills) || skills.length === 0) return [];

  // Pass 1 — collect every keyword string used in the array. A keyword
  // here means "the skill is already represented under some category",
  // so a bare top-level row with the same name can be dropped.
  const keywordsAcrossGroups = new Set<string>();
  for (const s of skills) {
    if (!Array.isArray(s?.keywords)) continue;
    for (const kw of s.keywords) {
      if (typeof kw === "string" && kw.trim()) {
        keywordsAcrossGroups.add(kw.toLowerCase().trim());
      }
    }
  }

  // Pass 2 — walk the input and emit the cleaned array. seenNames lets us
  // merge by case-insensitive name without a second walk.
  const out: Skill[] = [];
  const seenNames = new Map<string, number>();

  for (const s of skills) {
    const rawName = (s?.name ?? "").trim();
    if (!rawName) continue;
    const nameKey = rawName.toLowerCase();

    const hasKeywords = Array.isArray(s.keywords) && s.keywords.length > 0;
    // Drop bare rows whose name is already a keyword under some category.
    // Don't drop rows that themselves carry keywords — those rows are
    // categories, not duplicates, even if their name happens to clash.
    if (!hasKeywords && keywordsAcrossGroups.has(nameKey)) continue;

    const existingIdx = seenNames.get(nameKey);
    if (existingIdx !== undefined) {
      const prev = out[existingIdx];
      // Merge keywords (case-insensitive union, preserving original casing
      // from whichever entry surfaced the keyword first).
      prev.keywords = dedupeStringsCaseInsensitive([
        ...(prev.keywords ?? []),
        ...(s.keywords ?? []),
      ]);
      // Highest level wins. Free-form level strings outside the canonical
      // four are treated as rank 0 — they only fill in when the prev had no
      // level either.
      const prevRank = LEVEL_RANK[prev.level ?? ""] ?? 0;
      const curRank = LEVEL_RANK[s.level ?? ""] ?? 0;
      if (curRank > prevRank) prev.level = s.level;
      // Highest years wins.
      if (
        s.yearsOfExperience != null &&
        (prev.yearsOfExperience == null ||
          s.yearsOfExperience > prev.yearsOfExperience)
      ) {
        prev.yearsOfExperience = s.yearsOfExperience;
      }
      // Earliest id wins (preserves stable React keys / evidence joins).
      continue;
    }

    out.push({
      ...s,
      name: rawName,
      level: s.level ?? "",
      keywords: dedupeStringsCaseInsensitive(s.keywords),
    });
    seenNames.set(nameKey, out.length - 1);
  }

  return out;
}

