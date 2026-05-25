/**
 * URL builders for the interview-comparison surface. Pure functions split
 * from the page so they can be unit-tested without React.
 *
 * The compare page takes a comma-separated `ids` query param. The /compare
 * route component splits it and calls the API; callers build the href from
 * a selection set + this helper to keep deep-link / share / "open in new
 * tab" all on the same shape.
 */

export const COMPARE_MIN_IDS = 2;
export const COMPARE_MAX_IDS = 6;

export interface CompareLimits {
  min: number;
  max: number;
}

export const DEFAULT_COMPARE_LIMITS: CompareLimits = {
  min: COMPARE_MIN_IDS,
  max: COMPARE_MAX_IDS,
};

export function buildInterviewCompareHref(
  ids: readonly string[],
  limits: CompareLimits = DEFAULT_COMPARE_LIMITS,
): string {
  const cleaned = Array.from(new Set(ids.map((s) => s.trim()).filter(Boolean))).slice(0, limits.max);
  return `/interview-assignments/compare?ids=${encodeURIComponent(cleaned.join(","))}`;
}

/** Parse the `ids` query param into a normalised, deduplicated, capped list.
 *  Returns an empty array if the caller passed fewer than the minimum — the
 *  compare page treats that as an empty-state. */
export function parseCompareIds(
  raw: string | null | undefined,
  limits: CompareLimits = DEFAULT_COMPARE_LIMITS,
): string[] {
  if (!raw) return [];
  const cleaned = Array.from(
    new Set(raw.split(",").map((s) => s.trim()).filter(Boolean)),
  ).slice(0, limits.max);
  if (cleaned.length < limits.min) return [];
  return cleaned;
}

/** Toggle membership of `id` in `selection` with the size cap applied.
 *  Used by the list-view multi-select checkbox handler. Returns the next
 *  selection — does NOT mutate. */
export function toggleCompareSelection(
  selection: readonly string[],
  id: string,
  limits: CompareLimits = DEFAULT_COMPARE_LIMITS,
): string[] {
  if (selection.includes(id)) {
    return selection.filter((s) => s !== id);
  }
  if (selection.length >= limits.max) {
    return selection.slice(); // cap reached — caller can show a toast
  }
  return [...selection, id];
}
