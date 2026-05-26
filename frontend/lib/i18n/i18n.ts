/**
 * App-wide i18next setup.
 *
 * Locales: en (canonical / source-of-truth catalogue), es, w (super_admin
 * debug locale that replaces every letter with W to surface untranslated
 * strings).
 *
 * Catalogue shape: a SINGLE flat JSON per locale at /locales/{lng}.json.
 * Keys are the literal lookup paths (`"auth.login.title"`, `"common.save"`)
 * — `keySeparator: false` tells i18next not to walk dots, so the JSON key
 * IS the lookup. This keeps duplicate detection trivial (every key shows
 * up in one place in one file) and avoids the per-namespace HTTP fan-out
 * that was overkill for this app's catalogue size.
 *
 * Loading model:
 *   - English is BUNDLED into the JS bundle via static import. It's loaded
 *     synchronously on init so the very first render has resolved strings
 *     — no flash of raw keys, no flash of placeholders. Every user pays
 *     the EN-catalogue size once in the main JS chunk; in exchange, EN
 *     users see zero translation flash and non-EN users see real English
 *     copy (not raw keys) while their locale fetches in the background.
 *   - Spanish + W are loaded on demand via `i18next-http-backend` from
 *     `/locales/{{lng}}.json`. `partialBundledLanguages: true` tells
 *     i18next that some resources are already in memory and the backend
 *     should only fetch what's missing.
 *   - `fallbackLng: "en"` means a missing key in `es` falls back to the
 *     bundled English value rather than rendering the raw key.
 *
 * The W-language has an empty catalogue — every key falls back to `en`
 * and a post-processor mangles the resolved string into Ws. This keeps
 * the debug locale automatically in sync with `en` content without a
 * parallel translation file to maintain.
 */

import i18n, { type PostProcessorModule } from "i18next";
import { initReactI18next } from "react-i18next";
import HttpBackend from "i18next-http-backend";
import LanguageDetector from "i18next-browser-languagedetector";
// Bundle the English catalogue into the JS so the first render has values.
// Vite resolves this JSON at build time and inlines it into the main chunk.
import enResources from "../../public/locales/en.json";
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  normalizeLocale,
} from "@shared/i18n";

const W_LANGUAGE = "w";

/** Replace every alphabetic glyph with W (preserving case so layouts
 *  retain capitalisation cues). Spaces, digits and punctuation pass
 *  through so layout widths and structure stay roughly the same — the
 *  whole point is to *spot* unlocalised strings, not destroy the UI.
 *
 *  Exported for unit testing; runtime callers should use the post-
 *  processor (registered below) rather than calling this directly. */
export function toWLanguage(value: string): string {
  let out = "";
  for (const ch of value) {
    if (/\p{Lu}/u.test(ch)) out += "W";
    else if (/\p{Ll}/u.test(ch)) out += "w";
    else out += ch;
  }
  return out;
}

const wLanguagePostProcessor: PostProcessorModule = {
  type: "postProcessor",
  name: "wLanguage",
  process(value, _key, _options, translator) {
    const lng = (translator as { language?: string } | undefined)?.language;
    if (lng !== W_LANGUAGE) return value;
    if (typeof value !== "string") return value;
    return toWLanguage(value);
  },
};

void i18n
  .use(HttpBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .use(wLanguagePostProcessor)
  .init({
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: [...SUPPORTED_LOCALES],
    nonExplicitSupportedLngs: true,
    // Flat-key catalogue — the JSON key is the literal lookup. With this
    // false, i18next won't try to walk "auth.login.title" as a tree path.
    keySeparator: false,
    interpolation: { escapeValue: false },
    // Preload EN synchronously. i18next's default namespace is "translation".
    // Catalogue values are mostly strings but a few entries (Pricing tier
    // feature lists) are arrays consumed via `returnObjects: true`.
    resources: {
      en: { translation: enResources as Record<string, string | string[]> },
    },
    // ES and W still come from /locales/{lng}.json via HTTP backend; this
    // flag tells i18next that some bundles are pre-loaded so it doesn't
    // re-fetch EN.
    partialBundledLanguages: true,
    backend: { loadPath: "/locales/{{lng}}.json" },
    react: { useSuspense: false },
    postProcess: ["wLanguage"],
  });

/** Programmatic locale switch — call from the auth/settings layer once
 *  the user's saved preference loads. Normalises BCP47-style values
 *  ("en-US" → "en") so legacy DB rows still resolve, and silently
 *  ignores anything outside the supported set. */
export function applyLocale(locale: string | null | undefined): void {
  const norm = normalizeLocale(locale);
  if (!norm) return;
  if (i18n.language === norm) return;
  void i18n.changeLanguage(norm);
}

/** Shareable URL override — if the visitor lands with `?lang=fr-CA`
 *  (e.g. a recruiter sends a French-Canadian candidate a direct link),
 *  flip the active locale immediately so the page renders in the right
 *  language on first paint. This runs ONCE at module init alongside the
 *  i18next bootstrap, so it doesn't depend on React Router context.
 *
 *  The detector chain otherwise won't see the query param — its default
 *  order (querystring → cookie → localStorage → navigator) is wired in
 *  the library but the `lookupQuerystring` key is `lng`, not `lang`. We
 *  honour both `?lang=` (human-friendly) and `?lng=` (i18next default)
 *  here so docs that use either work. */
if (typeof window !== "undefined") {
  try {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("lang") ?? params.get("lng");
    const norm = normalizeLocale(requested);
    if (norm) {
      void i18n.changeLanguage(norm);
    }
  } catch {
    // URL parsing failures shouldn't break i18n bootstrap.
  }
}

export default i18n;
