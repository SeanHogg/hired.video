/**
 * Supported UI locales — the single source of truth for both the API
 * (sanitisation/role gating) and the frontend (i18next setup, Settings
 * picker). Stored on `user_settings.language` as the literal value.
 *
 *   en    — English (canonical source-of-truth catalogue)
 *   es    — Spanish (Latin American base; fork to es-MX for Mexico phase)
 *   fr-CA — Canadian French (Quebec Law 25 mandatory parity, Phase 1)
 *   w     — "W-language" debug locale, super_admin only. Renders every
 *           alphabetic glyph as W, preserving spaces / digits / punctuation
 *           so we can spot un-translated strings at a glance during QA.
 *           Implemented as an i18next post-processor over the English
 *           catalogue (no separate JSON to maintain).
 */

export const SUPPORTED_LOCALES = ["en", "es", "fr-CA", "w"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/** The W-language is reserved so real users can't accidentally lock
 *  themselves into the debug locale. Anything in this list, anyone may
 *  pick; anything else needs a role check via canPickLocale(). */
export const PUBLIC_LOCALES: readonly Locale[] = ["en", "es", "fr-CA"];

const SUPPORTED_SET: ReadonlySet<string> = new Set<string>(SUPPORTED_LOCALES);
const PUBLIC_SET: ReadonlySet<string> = new Set<string>(PUBLIC_LOCALES);

/** Base tags whose region subtag we PRESERVE when normalizing. Anything
 *  outside this set is stripped to base (so "en-US" → "en"). Adding to
 *  this set is the only place that needs to change when a new regional
 *  variant ships — the rest of the normalizer + i18next backend chain
 *  automatically picks it up. */
const PRESERVE_REGION_BASE: ReadonlySet<string> = new Set<string>(["fr", "es"]);

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && SUPPORTED_SET.has(value);
}

/** Normalise a stored or user-supplied locale value to a canonical Locale.
 *
 *  For base tags NOT in PRESERVE_REGION_BASE (currently only `en` and `w`),
 *  the region subtag is stripped: "en-US" → "en".
 *
 *  For base tags in PRESERVE_REGION_BASE (`fr`, `es`), the full BCP47 tag
 *  is preserved when it's a supported variant: "fr-CA" → "fr-CA". When the
 *  full tag isn't supported, we fall back to the bare base if THAT is
 *  supported: "fr-FR" → "fr" (currently null since `fr` isn't shipped
 *  standalone yet — the Phase 3 EU work adds it).
 *
 *  Returns null when nothing in the chain is supported.
 */
export function normalizeLocale(value: unknown): Locale | null {
  if (typeof value !== "string" || value.length === 0) return null;
  // Canonical-case the BCP47 tag: base lowercase, region UPPERCASE.
  const [rawBase, rawRegion] = value.split(/[-_]/);
  if (!rawBase) return null;
  const base = rawBase.toLowerCase();
  const region = rawRegion ? rawRegion.toUpperCase() : "";
  if (PRESERVE_REGION_BASE.has(base) && region) {
    const tagged = `${base}-${region}`;
    if (SUPPORTED_SET.has(tagged)) return tagged as Locale;
  }
  if (SUPPORTED_SET.has(base)) return base as Locale;
  return null;
}

/** Locale to hand to `Intl.*` constructors. The W-language is not a valid
 *  BCP47 tag (single letter) so passing it would throw `RangeError`; for
 *  Intl purposes we render dates/numbers in English while the i18next
 *  post-processor handles the W-mangling for *strings*. Regional variants
 *  (e.g. fr-CA) pass through unchanged — Intl knows them natively and
 *  gives Quebec-style date/number formatting for "fr-CA" vs European
 *  French formatting for "fr-FR". */
export function intlLocale(locale: string | null | undefined): string {
  const norm = normalizeLocale(locale);
  if (!norm || norm === "w") return "en";
  return norm;
}

/**
 * Whether `locale` may be persisted for a user holding `roles`. The
 * roles array is the JWT-claim shape (e.g. `["super_admin"]`).
 *
 * Returning false silently — the calling sanitizer drops the field
 * rather than 4xx-ing, matching the existing whitelist behaviour for
 * other settings fields.
 */
export function canPickLocale(locale: string, roles: readonly string[]): boolean {
  if (!isLocale(locale)) return false;
  if (PUBLIC_SET.has(locale)) return true;
  return roles.includes("super_admin");
}
