/**
 * Native-script display name + short tag per supported locale.
 *
 * Hardcoded (not translated through the catalogue) because the universal
 * i18n picker convention is to show each language in its own script — a
 * Spanish visitor sees "Español", an English visitor sees "Español",
 * everyone sees "Español". This is how LinkedIn, GitHub, Stripe, and the
 * UN style guides handle it: language names are proper nouns of their
 * own language, not translatable strings.
 *
 * Add an entry here when a new Locale ships in shared/i18n.ts. Both the
 * LocaleSwitcher dropdown and the GeoLocaleSuggestionBanner consume
 * these so per the DRY rule the labels live in one place.
 */

import type { Locale } from "@shared/i18n";

export const NATIVE_LABELS: Record<Locale, string> = {
  en: "English",
  es: "Español",
  "fr-CA": "Français (Canada)",
  w: "W-language (debug)",
};

/** Short tag for compact chrome (header trigger). fr-CA stays distinct
 *  from a future bare "fr" deliberately. */
export const SHORT_TAGS: Record<Locale, string> = {
  en: "EN",
  es: "ES",
  "fr-CA": "FR-CA",
  w: "W",
};
