// Manual merge of skills and certificates (and the evidence pointing at them).

import type {
  Skill,
  SkillEvidence,
  Certificate,
} from "../resume.js";
import { dedupeStringsCaseInsensitive, LEVEL_RANK } from "./normalize.js";
import { fillIfEmpty } from "./mergeHelpers.js";

// ─── Manual merge of skills (and the evidence that points at them) ────────

/**
 * Merge a set of skill rows into a single canonical row, remapping any
 * evidence that pointed at the absorbed names. The user picks which
 * skill is the "primary" — its `name` and `level` survive; the others
 * contribute their keywords + their old name itself (folded in as a
 * keyword on the primary so the canonical name stays visible) and any
 * higher `yearsOfExperience` they recorded.
 *
 * Why a single shared helper instead of per-call merge logic?
 *   1. The DRY rule — both the resume editor and the SkillExtractor
 *      tool surface a Merge action, and they have to behave identically
 *      (otherwise users get different shapes depending on entry point).
 *   2. Evidence remapping is the subtle part — when "AWS" is merged
 *      INTO "Cloud Architecture", every evidence row with `skillName:
 *      "AWS"` either drops (because AWS is now a keyword under Cloud
 *      Architecture and the heuristic will rebind it) or rebinds to the
 *      new primary. Consumers shouldn't reimplement that rule.
 *
 * Returns `{ skills, evidence }` so callers can update both arrays in a
 * single state mutation. Pure — does not mutate inputs.
 */
export function mergeSkills(input: {
  skills: Skill[];
  evidence: SkillEvidence[];
  /** Indexes (into `skills`) of the rows to fuse together. Must contain
   *  at least 2 indexes; out-of-range or duplicate indexes are ignored. */
  selectedIndexes: number[];
  /** Index of the primary — the row whose name + level survive. Must be
   *  in `selectedIndexes`. When omitted, defaults to the first index. */
  primaryIndex?: number;
}): { skills: Skill[]; evidence: SkillEvidence[] } {
  const { skills, evidence } = input;
  if (!Array.isArray(skills) || skills.length === 0) {
    return { skills: skills ?? [], evidence: evidence ?? [] };
  }

  // Sanitise selection — keep distinct, in-range, ≥ 2 entries.
  const selected = Array.from(new Set(input.selectedIndexes ?? []))
    .filter((i) => Number.isInteger(i) && i >= 0 && i < skills.length);
  if (selected.length < 2) return { skills, evidence };

  const primary =
    input.primaryIndex != null && selected.includes(input.primaryIndex)
      ? input.primaryIndex
      : selected[0];
  const primaryRow = skills[primary];
  const primaryName = (primaryRow.name ?? "").trim();
  if (!primaryName) {
    // Refuse to merge into a nameless row — there'd be nothing to bind
    // evidence to. Caller should rename first.
    return { skills, evidence };
  }
  const primaryNameLower = primaryName.toLowerCase();

  // Build the merged row — keywords are the union of every selected
  // row's keywords PLUS the absorbed rows' names themselves (so the
  // user can still see "AWS" as a keyword under "Cloud Architecture"
  // instead of losing the term entirely). Level/years take the highest.
  const mergedKeywords: string[] = [...(primaryRow.keywords ?? [])];
  let mergedLevel = primaryRow.level ?? "";
  let mergedYears = primaryRow.yearsOfExperience;

  const absorbedNamesLower = new Set<string>();
  for (const idx of selected) {
    if (idx === primary) continue;
    const row = skills[idx];
    const rowName = (row.name ?? "").trim();
    if (rowName && rowName.toLowerCase() !== primaryNameLower) {
      absorbedNamesLower.add(rowName.toLowerCase());
      mergedKeywords.push(rowName);
    }
    for (const kw of row.keywords ?? []) {
      const kwTrim = (kw ?? "").trim();
      if (kwTrim) mergedKeywords.push(kwTrim);
    }
    const prevRank = LEVEL_RANK[mergedLevel] ?? 0;
    const curRank = LEVEL_RANK[row.level ?? ""] ?? 0;
    if (curRank > prevRank) mergedLevel = row.level ?? mergedLevel;
    if (
      row.yearsOfExperience != null &&
      (mergedYears == null || row.yearsOfExperience > mergedYears)
    ) {
      mergedYears = row.yearsOfExperience;
    }
  }

  // Remove the absorbed name from keywords if it slipped in (the primary
  // shouldn't carry its own name as a keyword) and dedupe.
  const dedupedKeywords = dedupeStringsCaseInsensitive(
    mergedKeywords.filter(
      (kw) => kw.toLowerCase().trim() !== primaryNameLower,
    ),
  );

  const mergedRow: Skill = {
    ...primaryRow,
    name: primaryName,
    level: mergedLevel,
    keywords: dedupedKeywords,
    ...(mergedYears != null ? { yearsOfExperience: mergedYears } : {}),
  };

  // Replace primary in place; drop the others. Walking by index in
  // descending order so splice indexes stay valid as we mutate.
  const nextSkills = [...skills];
  nextSkills[primary] = mergedRow;
  for (const idx of [...selected].sort((a, b) => b - a)) {
    if (idx === primary) continue;
    nextSkills.splice(idx, 1);
  }

  // Remap evidence — every row whose `skillName` matches an absorbed name
  // gets rebound to the primary. Dedupe by (skillName, referenceId) since
  // two absorbed rows could have pointed at the same item.
  const remapped: SkillEvidence[] = [];
  const seen = new Set<string>();
  for (const ev of evidence ?? []) {
    const lower = ev.skillName.toLowerCase().trim();
    const next: SkillEvidence = absorbedNamesLower.has(lower)
      ? { ...ev, skillName: primaryName }
      : ev;
    const key = `${next.skillName.toLowerCase().trim()}::${next.referenceId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    remapped.push(next);
  }

  return { skills: nextSkills, evidence: remapped };
}

// ─── Manual merge of certificates (and the evidence that points at them) ───

/**
 * Merge a set of certificate rows into a single canonical row, remapping
 * any skill evidence whose `referenceId` pointed at the absorbed certs.
 * Mirrors `mergeSkills` in shape so the editor wiring is symmetric.
 *
 * Field rules (primary wins, but empty primary fields are filled from the
 * first absorbed row that has a value — so merging an "AWS Solutions
 * Architect" entry with the issuer/date filled into a same-named row that
 * had only the title doesn't lose the metadata):
 *   - name: primary's (the row whose name survives is the user's pick)
 *   - issuer / date / url / interactive: primary first, else first
 *     absorbed row that has a non-empty value
 *   - id: primary's (so existing skill evidence already pointing at the
 *     primary stays bound; only evidence pointing at absorbed ids is
 *     remapped)
 *
 * Evidence remap: any SkillEvidence row with `itemType === "certificate"`
 * and `referenceId` matching an absorbed cert's id has its `referenceId`
 * rewritten to the primary's id. Deduped by (skillName, referenceId) so
 * two absorbed certs that both proved the same skill collapse to one row.
 * If the primary has no id, we drop evidence pointing at absorbed ids
 * rather than orphan it (no anchor to remap to).
 */
export function mergeCertificates(input: {
  certificates: Certificate[];
  evidence: SkillEvidence[];
  /** Indexes (into `certificates`) of the rows to fuse. Must contain ≥ 2;
   *  out-of-range or duplicate indexes are ignored. */
  selectedIndexes: number[];
  /** Index of the primary — the row whose name survives. Must be in
   *  `selectedIndexes`. Defaults to the first selected index. */
  primaryIndex?: number;
}): { certificates: Certificate[]; evidence: SkillEvidence[] } {
  const { certificates, evidence } = input;
  if (!Array.isArray(certificates) || certificates.length === 0) {
    return { certificates: certificates ?? [], evidence: evidence ?? [] };
  }

  const selected = Array.from(new Set(input.selectedIndexes ?? []))
    .filter((i) => Number.isInteger(i) && i >= 0 && i < certificates.length);
  if (selected.length < 2) return { certificates, evidence };

  const primary =
    input.primaryIndex != null && selected.includes(input.primaryIndex)
      ? input.primaryIndex
      : selected[0];
  const primaryRow = certificates[primary];
  const primaryName = (primaryRow.name ?? "").trim();
  if (!primaryName) {
    // Refuse to merge into a nameless row — same rule as mergeSkills.
    return { certificates, evidence };
  }

  const fillIfEmpty = (current: string | undefined, fallbacks: (string | undefined)[]): string => {
    const cur = (current ?? "").trim();
    if (cur) return current ?? "";
    for (const f of fallbacks) {
      const v = (f ?? "").trim();
      if (v) return f ?? "";
    }
    return current ?? "";
  };

  const absorbed = selected.filter((i) => i !== primary).map((i) => certificates[i]);
  const absorbedIds = new Set(
    absorbed.map((c) => c.id).filter((id): id is string => !!id),
  );

  const mergedRow: Certificate = {
    ...primaryRow,
    name: primaryName,
    issuer: fillIfEmpty(primaryRow.issuer, absorbed.map((c) => c.issuer)),
    date: fillIfEmpty(primaryRow.date, absorbed.map((c) => c.date)),
    url: fillIfEmpty(primaryRow.url, absorbed.map((c) => c.url)),
    interactive:
      primaryRow.interactive ??
      absorbed.find((c) => c.interactive != null)?.interactive,
  };

  const nextCertificates = [...certificates];
  nextCertificates[primary] = mergedRow;
  for (const idx of [...selected].sort((a, b) => b - a)) {
    if (idx === primary) continue;
    nextCertificates.splice(idx, 1);
  }

  // Remap (or drop) skill evidence pointing at the absorbed cert ids.
  const primaryId = primaryRow.id;
  const remapped: SkillEvidence[] = [];
  const seen = new Set<string>();
  for (const ev of evidence ?? []) {
    let next: SkillEvidence = ev;
    if (ev.itemType === "certificate" && absorbedIds.has(ev.referenceId)) {
      if (!primaryId) continue; // nothing to rebind to — drop
      next = { ...ev, referenceId: primaryId };
    }
    const key = `${next.skillName.toLowerCase().trim()}::${next.referenceId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    remapped.push(next);
  }

  return { certificates: nextCertificates, evidence: remapped };
}

