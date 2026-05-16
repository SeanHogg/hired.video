/**
 * slugify — single source of truth for converting any string into a
 * URL-safe slug.
 *
 *   slugify("Acme Robotics, Inc.", { fallback: "company" })
 *     → "acme-robotics-inc"
 *   slugify("café résumé",         { fallback: "resume"  })
 *     → "cafe-resume"
 *   slugify("!!!",                 { fallback: () => `course-${Date.now()}` })
 *     → "course-1737..."
 *
 * Pipeline (in order):
 *   1. coerce null/undefined → "".
 *   2. lowercase.
 *   3. Unicode NFKD normalize + strip combining diacritical marks
 *      ("café" → "cafe"). This makes slugs deterministic across
 *      accented vs unaccented input.
 *   4. collapse runs of non-alphanumeric ASCII into single hyphens.
 *   5. trim leading / trailing hyphens.
 *   6. slice to `maxLen` (default 80).
 *   7. if the result is empty, return `fallback` (string) or `fallback()`
 *      (thunk — handy for time- or id-dependent fallbacks).
 *
 * The `fallback` field is required because every product surface has a
 * domain-specific "what should we call this when the input is pure
 * punctuation?" answer. Forcing the caller to spell it out keeps the
 * helper honest and prevents accidental empty slugs from leaking into
 * public URLs.
 */
export interface SlugifyOptions {
  /** Returned when the slugified output is empty. String or thunk
   *  (e.g. `() => \`course-${Date.now()}\``). Required. */
  fallback: string | (() => string);
  /** Hard cap on output length, applied AFTER stripping but BEFORE
   *  the fallback substitution. Defaults to 80, which is the validator
   *  width used by every public-URL slug column in the schema. */
  maxLen?: number;
}

// U+0300–U+036F = combining diacritical marks. After NFKD splits
// "café" into "cafe" + combining-acute, this regex drops the accent.
const COMBINING_MARKS = /[̀-ͯ]/g;
const NON_ALNUM = /[^a-z0-9]+/g;
const EDGE_HYPHENS = /^-+|-+$/g;

export function slugify(
  input: string | null | undefined,
  options: SlugifyOptions,
): string {
  const maxLen = options.maxLen ?? 80;
  const out = (input ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .replace(NON_ALNUM, "-")
    .replace(EDGE_HYPHENS, "")
    .slice(0, maxLen);
  if (out) return out;
  return typeof options.fallback === "function" ? options.fallback() : options.fallback;
}
