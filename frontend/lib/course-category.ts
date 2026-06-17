/**
 * Course `category` is a free-text varchar on the courses schema, but the
 * seeded platform library uses a small known set (AI / Career / Engineering).
 * Localize those known values through i18n while letting any custom
 * creator-authored category fall back to a *humanized* version of its raw
 * string (e.g. `software-engineering` → "Software Engineering") — never a
 * raw enum token and never a missing-key string.
 *
 * One seam so every category-badge render site resolves identically. Render
 * sites should call {@link courseCategoryLabel}; the key form is exposed for
 * callers that only need the i18n key.
 */
import type { TFunction } from "i18next";

export function courseCategoryI18nKey(category: string): string {
  return `courseCategory.${category}`;
}

/**
 * Humanize a raw category token for the fallback path: split on
 * separators / camelCase boundaries and Title-Case each word. Acronym-style
 * all-caps tokens (e.g. "AI") are preserved as-is.
 */
function humanizeCategory(category: string): string {
  const trimmed = category.trim();
  if (!trimmed) return trimmed;
  return trimmed
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/\s+/)
    .map((word) =>
      word.length > 1 && word === word.toUpperCase()
        ? word // keep acronyms like "AI" / "ML"
        : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");
}

/**
 * Resolve a course category to a display label. Known/seeded values resolve
 * through i18n (`courseCategory.<value>`); any unknown value falls back to a
 * humanized version of the raw string so a new/custom category still renders
 * readably in every locale.
 */
export function courseCategoryLabel(
  category: string,
  t: TFunction,
): string {
  return t(courseCategoryI18nKey(category), {
    defaultValue: humanizeCategory(category),
  });
}
