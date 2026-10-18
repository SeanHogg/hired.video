// Generic section-item merge helpers shared by the per-section merges.

import type {
  SkillEvidence,
  SkillEvidenceItemType,
} from "../resume.js";

// ─── Generic section-item merge helper ─────────────────────────────────────

/**
 * Pick the first non-empty value from a list of candidates. Used by every
 * `merge<Section>` function so an absorbed row's date / url / summary
 * fills in when the primary's field is empty. Pure.
 */
export function fillIfEmpty<T extends string | undefined>(
  current: T,
  fallbacks: (T | undefined)[],
): T | "" {
  const cur = (current ?? "").trim?.() ?? current ?? "";
  if (cur) return current ?? ("" as T);
  for (const f of fallbacks) {
    const v = (f ?? "").trim?.() ?? f ?? "";
    if (v) return f ?? ("" as T);
  }
  return current ?? ("" as T);
}

/** Concatenate string arrays from primary + absorbed and dedupe
 *  case-insensitively. Used for highlights, keywords, courses, roles. */
export function mergeStringArrays(...arrays: (readonly string[] | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const arr of arrays) {
    if (!Array.isArray(arr)) continue;
    for (const s of arr) {
      if (typeof s !== "string") continue;
      const trimmed = s.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(trimmed);
    }
  }
  return out;
}

/** Combine date ranges across merged items: earliest start, latest end.
 *  An empty / "Present" / unparseable end is treated as ongoing and wins
 *  any concrete end date. Returns the chosen { startDate, endDate }
 *  strings exactly as they appeared in the source rows so the user
 *  doesn't see formatting churn. */
export function mergeDateRange(
  rows: readonly { startDate?: string; endDate?: string }[],
): { startDate: string; endDate: string } {
  let earliestStart: { val: string; ts: number } | null = null;
  let latestEnd: { val: string; ts: number; ongoing: boolean } | null = null;
  const isOngoing = (e?: string) => {
    const s = (e || "").trim().toLowerCase();
    return s === "" || s === "present" || s === "current" || s === "now";
  };
  for (const r of rows) {
    if (r.startDate) {
      const ts = Date.parse(r.startDate);
      if (Number.isFinite(ts)) {
        if (!earliestStart || ts < earliestStart.ts) {
          earliestStart = { val: r.startDate, ts };
        }
      } else if (!earliestStart) {
        earliestStart = { val: r.startDate, ts: Number.POSITIVE_INFINITY };
      }
    }
    if (isOngoing(r.endDate)) {
      latestEnd = { val: r.endDate ?? "", ts: Number.POSITIVE_INFINITY, ongoing: true };
    } else if (r.endDate && (!latestEnd || !latestEnd.ongoing)) {
      const ts = Date.parse(r.endDate);
      if (Number.isFinite(ts)) {
        if (!latestEnd || ts > latestEnd.ts) {
          latestEnd = { val: r.endDate, ts, ongoing: false };
        }
      } else if (!latestEnd) {
        latestEnd = { val: r.endDate, ts: Number.NEGATIVE_INFINITY, ongoing: false };
      }
    }
  }
  return {
    startDate: earliestStart?.val ?? "",
    endDate: latestEnd?.val ?? "",
  };
}

/**
 * Generic section-item merge with evidence remap. Used by every
 * `merge<Section>` function whose evidence rows bind to the item via
 * `referenceId` (work, volunteer, project, education, certificate,
 * award, publication). Skills don't fit this shape — evidence binds to
 * the *skill name*, not to the skill row's id — so `mergeSkills` has
 * its own implementation above.
 *
 * Behavior:
 *   - Validates `selectedIndexes` (≥2 distinct, in-range).
 *   - Picks `primaryIndex`; defaults to first selected.
 *   - Refuses to merge into a primary that fails `hasIdentity`.
 *   - Calls `mergeFields(primary, absorbed)` for the per-domain field
 *     combination, then writes the merged row in place of the primary
 *     and splices the absorbed rows out.
 *   - Remaps every evidence row whose `itemType === evidenceItemType`
 *     and whose `referenceId` matches an absorbed row's id → the
 *     primary's id. Drops rebinds when the primary lacks an id.
 *     Dedupes by (skillName, referenceId).
 */
export function mergeSectionItems<T extends { id?: string }>(input: {
  items: T[];
  evidence: SkillEvidence[];
  evidenceItemType: SkillEvidenceItemType;
  selectedIndexes: number[];
  primaryIndex?: number;
  hasIdentity: (item: T) => boolean;
  mergeFields: (primary: T, absorbed: T[]) => T;
}): { items: T[]; evidence: SkillEvidence[] } {
  const { items, evidence, evidenceItemType, hasIdentity, mergeFields } = input;
  if (!Array.isArray(items) || items.length === 0) {
    return { items: items ?? [], evidence: evidence ?? [] };
  }
  const selected = Array.from(new Set(input.selectedIndexes ?? []))
    .filter((i) => Number.isInteger(i) && i >= 0 && i < items.length);
  if (selected.length < 2) return { items, evidence };

  const primary =
    input.primaryIndex != null && selected.includes(input.primaryIndex)
      ? input.primaryIndex
      : selected[0];
  const primaryRow = items[primary];
  if (!hasIdentity(primaryRow)) return { items, evidence };

  const absorbed = selected.filter((i) => i !== primary).map((i) => items[i]);
  const absorbedIds = new Set(
    absorbed.map((it) => it.id).filter((id): id is string => !!id),
  );
  const primaryId = primaryRow.id;

  const merged = mergeFields(primaryRow, absorbed);
  const nextItems = [...items];
  nextItems[primary] = merged;
  for (const idx of [...selected].sort((a, b) => b - a)) {
    if (idx === primary) continue;
    nextItems.splice(idx, 1);
  }

  const remapped: SkillEvidence[] = [];
  const seen = new Set<string>();
  for (const ev of evidence ?? []) {
    let next: SkillEvidence = ev;
    if (ev.itemType === evidenceItemType && absorbedIds.has(ev.referenceId)) {
      if (!primaryId) continue;
      next = { ...ev, referenceId: primaryId };
    }
    const key = `${next.skillName.toLowerCase().trim()}::${next.referenceId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    remapped.push(next);
  }
  return { items: nextItems, evidence: remapped };
}

