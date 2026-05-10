/**
 * Shared loose-enum coercion used by every `defineLenientIngest({ ... })`
 * spec across the codebase.
 *
 * Free-tier models drift on strict-enum fields in predictable ways:
 *   • casing  ("Critical" / "CRITICAL")
 *   • spacing  ("nice to have" / "nice_to_have")
 *   • synonyms ("high" → "critical", "medium" → "important")
 *
 * Each consumer used to inline its own switch/normalize block — same
 * shape, slightly different alias maps, scattered across the resume,
 * skill, match-insights, and tailor pipelines. This single helper
 * folds all of that into one call:
 *
 *   const SEVERITY = ["critical", "important", "minor"] as const;
 *   const ALIASES  = { high: "critical", medium: "important", low: "minor" };
 *
 *   coerceEnum(raw, { allowed: SEVERITY, aliases: ALIASES, fallback: "important" });
 *
 * Match order is canonical → alias → fallback, all case- and
 * separator-insensitive. The function is total (always returns one of
 * `allowed`) so coerce steps in `defineLenientIngest` stay pure.
 */

export interface CoerceEnumOpts<T extends readonly string[]> {
  /** Canonical allowed values. The function returns one of these. */
  allowed: T;
  /** Optional alias map — alias key (any casing/separators) → canonical
   *  value. Lookups are normalized (lowercased, whitespace / hyphens /
   *  underscores stripped) so callers don't have to enumerate every
   *  permutation. */
  aliases?: Record<string, T[number]>;
  /** Returned when nothing matches. Required so the call site doesn't
   *  surface `undefined` and the canonical schema validates. */
  fallback: T[number];
}

const norm = (s: string): string => s.toLowerCase().replace(/[\s_-]+/g, "");

export function coerceEnum<T extends readonly string[]>(
  raw: string | undefined | null,
  opts: CoerceEnumOpts<T>,
): T[number] {
  if (raw == null) return opts.fallback;
  const want = norm(raw);
  for (const v of opts.allowed) {
    if (norm(v) === want) return v;
  }
  if (opts.aliases) {
    // Try the normalized form first (covers most cases); fall through
    // to the raw lowercase form for callers who keyed aliases verbatim.
    const aliased = opts.aliases[want] ?? opts.aliases[raw.toLowerCase()];
    if (aliased && (opts.allowed as readonly string[]).includes(aliased)) {
      return aliased;
    }
  }
  return opts.fallback;
}
