/**
 * Explicit-content scan — the shared vocabulary (owner decision 2026-10-10).
 *
 * Everything a stranger can see on hired.video — above all the home page's
 * video wall — passes a standard "explicit" scan first: no sexual content or
 * nudity, no guns/weapons, no gore/violence, no swearing, no hate/slurs, no
 * drugs. The API persists one verdict per content item (`content_scans`) and
 * the public feed only shows items whose verdict is `pass`.
 *
 *   pass        — scanned, nothing explicit found
 *   block       — explicit content found (`categories` says what kind)
 *   unscreened  — not scanned yet, or the classifier was unavailable.
 *                 Never reaches the public wall (fails CLOSED for public
 *                 reach) but never blocks the owner's private use.
 *
 * The owner is told WHICH category blocked their content, never the
 * offending text itself (the `reason` stays server-side for SuperAdmin).
 */

export const EXPLICIT_CATEGORIES = [
  "sexual",
  "weapons",
  "violence",
  "profanity",
  "hate",
  "drugs",
] as const;
export type ExplicitCategory = (typeof EXPLICIT_CATEGORIES)[number];

export const SCAN_VERDICTS = ["pass", "block", "unscreened"] as const;
export type ScanVerdict = (typeof SCAN_VERDICTS)[number];

/** What a content scan row is about. `video_frames` holds the vision verdict
 *  of the frames the client sampled from one render (keyed by video id, with
 *  the render's storage key as its input hash). */
export const SCAN_SUBJECT_KINDS = [
  "video",
  "video_frames",
  "image",
  "profile",
  "video_personalization",
] as const;
export type ScanSubjectKind = (typeof SCAN_SUBJECT_KINDS)[number];

/** The SuperAdmin override: approve (pass) or keep blocked. */
export const SCAN_OVERRIDES = ["pass", "block"] as const;
export type ScanOverride = (typeof SCAN_OVERRIDES)[number];

export interface ExplicitVerdict {
  verdict: ScanVerdict;
  categories: ExplicitCategory[];
  /** Server-side explanation (matched rule / classifier sentence). Never
   *  sent to the content owner. */
  reason: string | null;
}

export const PASS_VERDICT: ExplicitVerdict = Object.freeze({
  verdict: "pass",
  categories: [],
  reason: null,
}) as ExplicitVerdict;

export function unscreenedVerdict(reason: string): ExplicitVerdict {
  return { verdict: "unscreened", categories: [], reason };
}

export function isExplicitCategory(value: unknown): value is ExplicitCategory {
  return typeof value === "string" && (EXPLICIT_CATEGORIES as readonly string[]).includes(value);
}

export function isScanVerdict(value: unknown): value is ScanVerdict {
  return typeof value === "string" && (SCAN_VERDICTS as readonly string[]).includes(value);
}

/** Keep only known categories, de-duplicated, in canonical order. */
export function normalizeCategories(values: readonly unknown[]): ExplicitCategory[] {
  const set = new Set(values.filter(isExplicitCategory));
  return EXPLICIT_CATEGORIES.filter((c) => set.has(c));
}

/**
 * Combine the verdicts of every part of one content item (its text, each
 * image, its frames). Any block blocks (categories are unioned, reasons
 * joined); otherwise any unscreened part leaves the whole item unscreened;
 * only an item whose every part passed passes. No parts = pass.
 */
export function mergeVerdicts(parts: readonly ExplicitVerdict[]): ExplicitVerdict {
  const blocks = parts.filter((p) => p.verdict === "block");
  if (blocks.length > 0) {
    return {
      verdict: "block",
      categories: normalizeCategories(blocks.flatMap((b) => b.categories)),
      reason: joinReasons(blocks),
    };
  }
  const unscreened = parts.filter((p) => p.verdict === "unscreened");
  if (unscreened.length > 0) {
    return { verdict: "unscreened", categories: [], reason: joinReasons(unscreened) };
  }
  return { ...PASS_VERDICT, categories: [] };
}

function joinReasons(parts: readonly ExplicitVerdict[]): string | null {
  const reasons = [...new Set(parts.map((p) => p.reason).filter((r): r is string => !!r))];
  return reasons.length ? reasons.join("; ").slice(0, 1000) : null;
}

/** The verdict that counts: a SuperAdmin override wins over the scan. */
export function effectiveVerdict(scan: { verdict: ScanVerdict; overrideVerdict?: ScanOverride | null }): ScanVerdict {
  return scan.overrideVerdict ?? scan.verdict;
}

/** May this item reach the public wall? Only an effective `pass` may —
 *  a missing scan or an unscreened one fails closed. */
export function isPubliclyVisible(
  scan: { verdict: ScanVerdict; overrideVerdict?: ScanOverride | null } | null | undefined,
): boolean {
  return !!scan && effectiveVerdict(scan) === "pass";
}

/** What the owner of a scanned item sees: the verdict and the categories,
 *  never the reason. */
export interface OwnerScanStatus {
  verdict: ScanVerdict;
  categories: ExplicitCategory[];
}

/** A stored scan as its owner may see it (override applied; categories
 *  dropped once it passes). */
export function ownerStatusOf(scan: {
  verdict: ScanVerdict;
  overrideVerdict?: ScanOverride | null;
  categories: readonly ExplicitCategory[];
}): OwnerScanStatus {
  const verdict = effectiveVerdict(scan);
  return { verdict, categories: verdict === "pass" ? [] : [...scan.categories] };
}
