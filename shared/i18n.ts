/**
 * Supported UI locales — the single source of truth for both the API
 * (sanitisation/role gating) and the frontend (i18next setup, Settings
 * picker). Stored on `account_preferences.language` as the literal value.
 *
 *   en — English (canonical source-of-truth catalogue)
 *   es — Spanish
 *   w  — "W-language" debug locale, super_admin only. Renders every
 *        alphabetic glyph as W, preserving spaces / digits / punctuation
 *        so we can spot un-translated strings at a glance during QA.
 *        Implemented as an i18next post-processor over the English
 *        catalogue (no separate JSON to maintain).
 */

export const SUPPORTED_LOCALES = ["en", "es", "w"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/** The W-language is reserved so real users can't accidentally lock
 *  themselves into the debug locale. Anything in this list, anyone may
 *  pick; anything else needs a role check via canPickLocale(). */
export const PUBLIC_LOCALES: readonly Locale[] = ["en", "es"];

const SUPPORTED_SET: ReadonlySet<string> = new Set<string>(SUPPORTED_LOCALES);
const PUBLIC_SET: ReadonlySet<string> = new Set<string>(PUBLIC_LOCALES);

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && SUPPORTED_SET.has(value);
}

/** Normalise a stored or user-supplied locale value to a canonical Locale.
 *  Strips region/script subtags ("en-US" → "en", "es_MX" → "es") and lower-cases
 *  before lookup so legacy DB rows with BCP47-style values still resolve.
 *  Returns null when the base tag isn't supported. */
export function normalizeLocale(value: unknown): Locale | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const base = value.split(/[-_]/)[0].toLowerCase();
  return SUPPORTED_SET.has(base) ? (base as Locale) : null;
}

/** Locale to hand to `Intl.*` constructors. The W-language is not a valid
 *  BCP47 tag (single letter) so passing it would throw `RangeError`; for
 *  Intl purposes we render dates/numbers in English while the i18next
 *  post-processor handles the W-mangling for *strings*. */
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
