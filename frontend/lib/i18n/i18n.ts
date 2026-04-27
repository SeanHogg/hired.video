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
 * The W-language has an empty catalogue — every key falls back to `en`
 * and a post-processor mangles the resolved string into Ws. This keeps
 * the debug locale automatically in sync with `en` content without a
 * parallel translation file to maintain.
 */

import i18n, { type PostProcessorModule } from "i18next";
import { initReactI18next } from "react-i18next";
import HttpBackend from "i18next-http-backend";
import LanguageDetector from "i18next-browser-languagedetector";
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

export default i18n;
